/**
 * Unit tests for contract API routes:
 * - POST /api/contracts/deploy
 * - POST /api/contracts/invoke
 * - POST /api/contracts/simulate
 *
 * Tests cover:
 * - Deploy: success (stores contract in DB), validation errors, role guard (non-MERCHANT rejected), deployment failure (502)
 * - Invoke: success, inter-contract call with subAuth, validation errors, role guard
 * - Simulate: success, validation errors
 *
 * @see Requirements 4.1, 4.4, 5.1, 5.4, 6.4, 6.5
 */

import { POST as deployPOST } from '../deploy/route';
import { POST as invokePOST } from '../invoke/route';
import { POST as simulatePOST } from '../simulate/route';
import * as ContractServiceModule from '@/lib/services/contract.service';
import * as EncryptionServiceModule from '@/lib/services/encryption.service';
import { prisma } from '@/lib/prisma';

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('@/lib/services/contract.service', () => {
  const actual = jest.requireActual(
    '@/lib/services/contract.service',
  ) as typeof ContractServiceModule;
  return {
    ...actual,
    deployContract: jest.fn(),
    invokeContract: jest.fn(),
    simulateContract: jest.fn(),
    nativeToScVal: jest.fn((v: unknown) => v),
    scValToNative: jest.fn((v: unknown) => v),
  };
});

jest.mock('@/lib/services/encryption.service', () => {
  const actual = jest.requireActual(
    '@/lib/services/encryption.service',
  ) as typeof EncryptionServiceModule;
  return {
    ...actual,
    decrypt: jest.fn(),
  };
});

const mockDeployContract =
  ContractServiceModule.deployContract as jest.MockedFunction<
    typeof ContractServiceModule.deployContract
  >;
const mockInvokeContract =
  ContractServiceModule.invokeContract as jest.MockedFunction<
    typeof ContractServiceModule.invokeContract
  >;
const mockSimulateContract =
  ContractServiceModule.simulateContract as jest.MockedFunction<
    typeof ContractServiceModule.simulateContract
  >;
const mockDecrypt =
  EncryptionServiceModule.decrypt as jest.MockedFunction<
    typeof EncryptionServiceModule.decrypt
  >;

const mockPrisma = prisma as unknown as {
  wallet: { findUnique: jest.MockedFunction<() => unknown> };
  contract: { create: jest.MockedFunction<() => unknown> };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Builds a POST Request with JSON body and auth headers.
 */
function buildRequest(
  url: string,
  body: unknown,
  options?: {
    userId?: string;
    role?: string;
    omitCsrf?: boolean;
    omitAuth?: boolean;
  },
): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };

  if (!options?.omitCsrf) {
    headers['x-csrf-token'] = 'test-csrf-token';
  }

  if (!options?.omitAuth) {
    headers['x-user-id'] = options?.userId ?? 'user-1';
    headers['x-user-role'] = options?.role ?? 'MERCHANT';
  }

  return new Request(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

/**
 * Builds a Request with an invalid JSON body.
 */
function buildBadJsonRequest(url: string, role = 'MERCHANT'): Request {
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': 'test-csrf-token',
      'x-user-id': 'user-1',
      'x-user-role': role,
    },
    body: 'not-valid-json{{{',
  });
}

// ─── Test Data ───────────────────────────────────────────────────────────────

const DEPLOY_URL = 'http://localhost/api/contracts/deploy';
const INVOKE_URL = 'http://localhost/api/contracts/invoke';
const SIMULATE_URL = 'http://localhost/api/contracts/simulate';

const validDeployPayload = {
  wasmBase64: Buffer.from('fake-wasm-binary').toString('base64'),
};

const validInvokePayload = {
  contractId: 'CABC123DEF456',
  functionName: 'transfer',
  args: ['arg1', 'arg2'],
};

const validSimulatePayload = {
  contractId: 'CABC123DEF456',
  functionName: 'balance',
  args: ['addr1'],
};

const mockWallet = {
  userId: 'user-1',
  stellarAddress: 'GABCDEF123456',
  encryptedSecretKey: 'encrypted-secret',
  encryptionIV: 'iv-hex',
  authTag: 'auth-tag-hex',
};

// ─── Deploy Route Tests ──────────────────────────────────────────────────────

describe('POST /api/contracts/deploy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 with contractId and transactionHash on success', async () => {
    mockPrisma.wallet.findUnique.mockResolvedValueOnce(mockWallet);
    mockDecrypt.mockReturnValueOnce('SDEPLOYER_SECRET');
    mockDeployContract.mockResolvedValueOnce({
      contractId: 'CNEW_CONTRACT_ID',
      transactionHash: 'tx-hash-deploy',
    });
    mockPrisma.contract.create.mockResolvedValueOnce({});

    const request = buildRequest(DEPLOY_URL, validDeployPayload);
    const response = await deployPOST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.contractId).toBe('CNEW_CONTRACT_ID');
    expect(data.transactionHash).toBe('tx-hash-deploy');
  });

  it('stores the contract in the database after successful deployment', async () => {
    mockPrisma.wallet.findUnique.mockResolvedValueOnce(mockWallet);
    mockDecrypt.mockReturnValueOnce('SDEPLOYER_SECRET');
    mockDeployContract.mockResolvedValueOnce({
      contractId: 'CNEW_CONTRACT_ID',
      transactionHash: 'tx-hash-deploy',
    });
    mockPrisma.contract.create.mockResolvedValueOnce({});

    const request = buildRequest(DEPLOY_URL, validDeployPayload);
    await deployPOST(request);

    expect(mockPrisma.contract.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        contractId: 'CNEW_CONTRACT_ID',
        contractType: 'CUSTOM',
        deployerAddress: 'GABCDEF123456',
        deployerId: 'user-1',
        deployTxHash: 'tx-hash-deploy',
      }),
    });
  });

  it('returns 403 when CSRF token is missing', async () => {
    const request = buildRequest(DEPLOY_URL, validDeployPayload, {
      omitCsrf: true,
    });
    const response = await deployPOST(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('CSRF');
    expect(mockDeployContract).not.toHaveBeenCalled();
  });

  it('returns 403 for USER role (non-MERCHANT rejected)', async () => {
    const request = buildRequest(DEPLOY_URL, validDeployPayload, {
      role: 'USER',
    });
    const response = await deployPOST(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('Forbidden');
    expect(mockDeployContract).not.toHaveBeenCalled();
  });

  it('returns 403 for ADMIN role', async () => {
    const request = buildRequest(DEPLOY_URL, validDeployPayload, {
      role: 'ADMIN',
    });
    const response = await deployPOST(request);

    expect(response.status).toBe(403);
    expect(mockDeployContract).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON body', async () => {
    const request = buildBadJsonRequest(DEPLOY_URL);
    const response = await deployPOST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid JSON');
  });

  it('returns 400 when wasmBase64 is missing', async () => {
    const request = buildRequest(DEPLOY_URL, {});
    const response = await deployPOST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Validation failed.');
  });

  it('returns 400 when wasmBase64 is empty string', async () => {
    const request = buildRequest(DEPLOY_URL, { wasmBase64: '' });
    const response = await deployPOST(request);

    expect(response.status).toBe(400);
  });

  it('returns 400 when wallet is not found', async () => {
    mockPrisma.wallet.findUnique.mockResolvedValueOnce(null);

    const request = buildRequest(DEPLOY_URL, validDeployPayload);
    const response = await deployPOST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Wallet not found');
  });

  it('returns 502 when deployment is rejected by network', async () => {
    mockPrisma.wallet.findUnique.mockResolvedValueOnce(mockWallet);
    mockDecrypt.mockReturnValueOnce('SDEPLOYER_SECRET');
    mockDeployContract.mockRejectedValueOnce(
      new Error('Contract WASM upload rejected by network: error-detail'),
    );

    const request = buildRequest(DEPLOY_URL, validDeployPayload);
    const response = await deployPOST(request);

    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.error).toContain('rejected by network');
  });

  it('returns 500 for unexpected errors', async () => {
    mockPrisma.wallet.findUnique.mockResolvedValueOnce(mockWallet);
    mockDecrypt.mockReturnValueOnce('SDEPLOYER_SECRET');
    mockDeployContract.mockRejectedValueOnce(
      new Error('Database connection failed'),
    );

    const request = buildRequest(DEPLOY_URL, validDeployPayload);
    const response = await deployPOST(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('unexpected error');
  });
});

// ─── Invoke Route Tests ──────────────────────────────────────────────────────

describe('POST /api/contracts/invoke', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 with transactionHash and returnValue on success', async () => {
    mockPrisma.wallet.findUnique.mockResolvedValueOnce(mockWallet);
    mockDecrypt.mockReturnValueOnce('SCALLER_SECRET');
    mockInvokeContract.mockResolvedValueOnce({
      transactionHash: 'tx-hash-invoke',
      returnValue: 'mock-return-value' as unknown as ContractServiceModule.xdr.ScVal,
    });

    const request = buildRequest(INVOKE_URL, validInvokePayload);
    const response = await invokePOST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.transactionHash).toBe('tx-hash-invoke');
    expect(data.returnValue).toBe('mock-return-value');
  });

  it('handles inter-contract call with subAuth correctly', async () => {
    const payloadWithSubAuth = {
      ...validInvokePayload,
      subAuth: [
        {
          contractId: 'CSUB_CONTRACT_1',
          functionName: 'transfer',
          args: ['from', 'to', 100],
        },
      ],
    };

    mockPrisma.wallet.findUnique.mockResolvedValueOnce(mockWallet);
    mockDecrypt.mockReturnValueOnce('SCALLER_SECRET');
    mockInvokeContract.mockResolvedValueOnce({
      transactionHash: 'tx-hash-sub-auth',
      returnValue: 'sub-auth-result' as unknown as ContractServiceModule.xdr.ScVal,
    });

    const request = buildRequest(INVOKE_URL, payloadWithSubAuth);
    const response = await invokePOST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.transactionHash).toBe('tx-hash-sub-auth');

    // Verify invokeContract was called with subAuth entries
    expect(mockInvokeContract).toHaveBeenCalledWith(
      'CABC123DEF456',
      'transfer',
      expect.any(Array),
      'SCALLER_SECRET',
      expect.arrayContaining([
        expect.objectContaining({
          contractId: 'CSUB_CONTRACT_1',
          functionName: 'transfer',
        }),
      ]),
    );
  });

  it('returns 403 when CSRF token is missing', async () => {
    const request = buildRequest(INVOKE_URL, validInvokePayload, {
      omitCsrf: true,
    });
    const response = await invokePOST(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('CSRF');
    expect(mockInvokeContract).not.toHaveBeenCalled();
  });

  it('returns 403 for ADMIN role', async () => {
    const request = buildRequest(INVOKE_URL, validInvokePayload, {
      role: 'ADMIN',
    });
    const response = await invokePOST(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('Forbidden');
    expect(mockInvokeContract).not.toHaveBeenCalled();
  });

  it('allows USER role to invoke contracts', async () => {
    mockPrisma.wallet.findUnique.mockResolvedValueOnce(mockWallet);
    mockDecrypt.mockReturnValueOnce('SCALLER_SECRET');
    mockInvokeContract.mockResolvedValueOnce({
      transactionHash: 'tx-hash-user',
      returnValue: 'user-result' as unknown as ContractServiceModule.xdr.ScVal,
    });

    const request = buildRequest(INVOKE_URL, validInvokePayload, {
      role: 'USER',
    });
    const response = await invokePOST(request);

    expect(response.status).toBe(200);
  });

  it('returns 400 for invalid JSON body', async () => {
    const request = buildBadJsonRequest(INVOKE_URL);
    const response = await invokePOST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid JSON');
  });

  it('returns 400 when contractId is missing', async () => {
    const request = buildRequest(INVOKE_URL, {
      functionName: 'transfer',
      args: [],
    });
    const response = await invokePOST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Validation failed.');
  });

  it('returns 400 when functionName is missing', async () => {
    const request = buildRequest(INVOKE_URL, {
      contractId: 'CABC123',
      args: [],
    });
    const response = await invokePOST(request);

    expect(response.status).toBe(400);
  });

  it('returns 400 when args is missing', async () => {
    const request = buildRequest(INVOKE_URL, {
      contractId: 'CABC123',
      functionName: 'transfer',
    });
    const response = await invokePOST(request);

    expect(response.status).toBe(400);
  });

  it('returns 400 when wallet is not found', async () => {
    mockPrisma.wallet.findUnique.mockResolvedValueOnce(null);

    const request = buildRequest(INVOKE_URL, validInvokePayload);
    const response = await invokePOST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Wallet not found');
  });

  it('returns 502 when invocation is rejected by network', async () => {
    mockPrisma.wallet.findUnique.mockResolvedValueOnce(mockWallet);
    mockDecrypt.mockReturnValueOnce('SCALLER_SECRET');
    mockInvokeContract.mockRejectedValueOnce(
      new Error('Contract invocation rejected by network: error-detail'),
    );

    const request = buildRequest(INVOKE_URL, validInvokePayload);
    const response = await invokePOST(request);

    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.error).toContain('rejected by network');
  });

  it('returns 502 when missing authorization on sub-contract', async () => {
    mockPrisma.wallet.findUnique.mockResolvedValueOnce(mockWallet);
    mockDecrypt.mockReturnValueOnce('SCALLER_SECRET');
    mockInvokeContract.mockRejectedValueOnce(
      new Error('Contract invocation failed due to missing authorization'),
    );

    const request = buildRequest(INVOKE_URL, validInvokePayload);
    const response = await invokePOST(request);

    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.error).toContain('missing authorization');
  });

  it('returns 500 for unexpected errors', async () => {
    mockPrisma.wallet.findUnique.mockResolvedValueOnce(mockWallet);
    mockDecrypt.mockReturnValueOnce('SCALLER_SECRET');
    mockInvokeContract.mockRejectedValueOnce(
      new Error('Database connection failed'),
    );

    const request = buildRequest(INVOKE_URL, validInvokePayload);
    const response = await invokePOST(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('unexpected error');
  });
});

// ─── Simulate Route Tests ────────────────────────────────────────────────────

describe('POST /api/contracts/simulate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 with returnValue on success', async () => {
    mockSimulateContract.mockResolvedValueOnce({
      returnValue: 'simulated-result' as unknown as ContractServiceModule.xdr.ScVal,
    });

    const request = buildRequest(SIMULATE_URL, validSimulatePayload, {
      role: 'USER',
    });
    const response = await simulatePOST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.returnValue).toBe('simulated-result');
  });

  it('does not require a wallet for simulation', async () => {
    mockSimulateContract.mockResolvedValueOnce({
      returnValue: 'no-wallet-needed' as unknown as ContractServiceModule.xdr.ScVal,
    });

    const request = buildRequest(SIMULATE_URL, validSimulatePayload, {
      role: 'MERCHANT',
    });
    const response = await simulatePOST(request);

    expect(response.status).toBe(200);
    // Wallet should never be queried for simulate
    expect(mockPrisma.wallet.findUnique).not.toHaveBeenCalled();
  });

  it('allows MERCHANT role to simulate', async () => {
    mockSimulateContract.mockResolvedValueOnce({
      returnValue: 'merchant-sim' as unknown as ContractServiceModule.xdr.ScVal,
    });

    const request = buildRequest(SIMULATE_URL, validSimulatePayload, {
      role: 'MERCHANT',
    });
    const response = await simulatePOST(request);

    expect(response.status).toBe(200);
  });

  it('returns 403 when CSRF token is missing', async () => {
    const request = buildRequest(SIMULATE_URL, validSimulatePayload, {
      role: 'USER',
      omitCsrf: true,
    });
    const response = await simulatePOST(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('CSRF');
  });

  it('returns 403 for ADMIN role', async () => {
    const request = buildRequest(SIMULATE_URL, validSimulatePayload, {
      role: 'ADMIN',
    });
    const response = await simulatePOST(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('Forbidden');
  });

  it('returns 400 for invalid JSON body', async () => {
    const request = buildBadJsonRequest(SIMULATE_URL, 'USER');
    const response = await simulatePOST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid JSON');
  });

  it('returns 400 when contractId is missing', async () => {
    const request = buildRequest(
      SIMULATE_URL,
      { functionName: 'balance', args: [] },
      { role: 'USER' },
    );
    const response = await simulatePOST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Validation failed.');
  });

  it('returns 400 when functionName is missing', async () => {
    const request = buildRequest(
      SIMULATE_URL,
      { contractId: 'CABC123', args: [] },
      { role: 'USER' },
    );
    const response = await simulatePOST(request);

    expect(response.status).toBe(400);
  });

  it('returns 502 when simulation fails on Stellar', async () => {
    mockSimulateContract.mockRejectedValueOnce(
      new Error('Contract simulation failed: invalid function'),
    );

    const request = buildRequest(SIMULATE_URL, validSimulatePayload, {
      role: 'USER',
    });
    const response = await simulatePOST(request);

    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.error).toContain('simulation failed');
  });

  it('returns 500 for unexpected errors', async () => {
    mockSimulateContract.mockRejectedValueOnce(
      new Error('Unexpected internal error'),
    );

    const request = buildRequest(SIMULATE_URL, validSimulatePayload, {
      role: 'USER',
    });
    const response = await simulatePOST(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('unexpected error');
  });
});
