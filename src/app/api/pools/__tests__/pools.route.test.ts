/**
 * Unit tests for pool API routes:
 * - POST /api/pools/deposit
 * - POST /api/pools/withdraw
 * - POST /api/pools/swap
 * - GET /api/pools/positions
 *
 * Tests cover:
 * - Deposit: success, validation errors, role guard (non-MERCHANT rejected), on-chain failure
 * - Withdraw: success, validation errors, role guard
 * - Swap: success, slippage rejection, validation errors, role guard
 * - Positions: success with positions, empty result, role guard
 *
 * @see Requirements 8.5, 8.6, 9.4, 9.5
 */

import { POST as depositPOST } from '../deposit/route';
import { POST as withdrawPOST } from '../withdraw/route';
import { POST as swapPOST } from '../swap/route';
import { GET as positionsGET } from '../positions/route';
import * as PoolServiceModule from '@/lib/services/pool.service';
import { prisma } from '@/lib/prisma';

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('@/lib/services/pool.service', () => {
  const actual = jest.requireActual(
    '@/lib/services/pool.service',
  ) as typeof PoolServiceModule;
  return {
    ...actual,
    deposit: jest.fn(),
    withdraw: jest.fn(),
    swap: jest.fn(),
  };
});

const mockDeposit = PoolServiceModule.deposit as jest.MockedFunction<
  typeof PoolServiceModule.deposit
>;
const mockWithdraw = PoolServiceModule.withdraw as jest.MockedFunction<
  typeof PoolServiceModule.withdraw
>;
const mockSwap = PoolServiceModule.swap as jest.MockedFunction<
  typeof PoolServiceModule.swap
>;

// Prisma is already mocked globally via test/setup.ts
const mockPrisma = prisma as unknown as {
  lPPosition: {
    findMany: jest.MockedFunction<typeof prisma.lPPosition.findMany>;
  };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Builds a POST Request with JSON body and auth headers.
 */
function buildPostRequest(
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
 * Builds a GET Request with auth headers.
 */
function buildGetRequest(
  url: string,
  options?: {
    userId?: string;
    role?: string;
  },
): Request {
  const headers: Record<string, string> = {};

  headers['x-user-id'] = options?.userId ?? 'user-1';
  headers['x-user-role'] = options?.role ?? 'MERCHANT';

  return new Request(url, {
    method: 'GET',
    headers,
  });
}

// ─── Test Data ───────────────────────────────────────────────────────────────

const DEPOSIT_URL = 'http://localhost/api/pools/deposit';
const WITHDRAW_URL = 'http://localhost/api/pools/withdraw';
const SWAP_URL = 'http://localhost/api/pools/swap';
const POSITIONS_URL = 'http://localhost/api/pools/positions';

const validDepositPayload = {
  poolContractId: 'CPOOL_CONTRACT_1',
  amountA: '1000000',
  amountB: '2000000',
  pin: '1234',
};

const validWithdrawPayload = {
  poolContractId: 'CPOOL_CONTRACT_1',
  shares: '500000',
  pin: '1234',
};

const validSwapPayload = {
  poolContractId: 'CPOOL_CONTRACT_1',
  inputToken: 'CTOKEN_A',
  inputAmount: '100000',
  minOutputAmount: '90000',
  pin: '1234',
};

// ─── Deposit Route Tests ─────────────────────────────────────────────────────

describe('POST /api/pools/deposit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 with shares and transactionHash on success', async () => {
    mockDeposit.mockResolvedValueOnce({
      shares: '1500000',
      transactionHash: 'tx-hash-deposit',
    });

    const request = buildPostRequest(DEPOSIT_URL, validDepositPayload);
    const response = await depositPOST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.shares).toBe('1500000');
    expect(data.transactionHash).toBe('tx-hash-deposit');
  });

  it('calls deposit with correct parameters', async () => {
    mockDeposit.mockResolvedValueOnce({
      shares: '1500000',
      transactionHash: 'tx-hash-deposit',
    });

    const request = buildPostRequest(DEPOSIT_URL, validDepositPayload);
    await depositPOST(request);

    expect(mockDeposit).toHaveBeenCalledWith({
      poolContractId: 'CPOOL_CONTRACT_1',
      amountA: '1000000',
      amountB: '2000000',
      merchantId: 'user-1',
      pin: '1234',
    });
  });

  it('returns 403 when CSRF token is missing', async () => {
    const request = buildPostRequest(DEPOSIT_URL, validDepositPayload, {
      omitCsrf: true,
    });
    const response = await depositPOST(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('CSRF');
    expect(mockDeposit).not.toHaveBeenCalled();
  });

  it('returns 403 for USER role (non-MERCHANT rejected)', async () => {
    const request = buildPostRequest(DEPOSIT_URL, validDepositPayload, {
      role: 'USER',
    });
    const response = await depositPOST(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('Forbidden');
    expect(mockDeposit).not.toHaveBeenCalled();
  });

  it('returns 403 for ADMIN role', async () => {
    const request = buildPostRequest(DEPOSIT_URL, validDepositPayload, {
      role: 'ADMIN',
    });
    const response = await depositPOST(request);

    expect(response.status).toBe(403);
    expect(mockDeposit).not.toHaveBeenCalled();
  });

  it('returns 400 when poolContractId is empty', async () => {
    const request = buildPostRequest(DEPOSIT_URL, {
      ...validDepositPayload,
      poolContractId: '',
    });
    const response = await depositPOST(request);

    expect(response.status).toBe(400);
    expect(mockDeposit).not.toHaveBeenCalled();
  });

  it('returns 400 when amountA is not a positive numeric string', async () => {
    const request = buildPostRequest(DEPOSIT_URL, {
      ...validDepositPayload,
      amountA: '0',
    });
    const response = await depositPOST(request);

    expect(response.status).toBe(400);
    expect(mockDeposit).not.toHaveBeenCalled();
  });

  it('returns 400 when pin is invalid (too short)', async () => {
    const request = buildPostRequest(DEPOSIT_URL, {
      ...validDepositPayload,
      pin: '12',
    });
    const response = await depositPOST(request);

    expect(response.status).toBe(400);
    expect(mockDeposit).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON body', async () => {
    const request = new Request(DEPOSIT_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': 'test-csrf-token',
        'x-user-id': 'user-1',
        'x-user-role': 'MERCHANT',
      },
      body: 'not-valid-json{{{',
    });
    const response = await depositPOST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid JSON');
  });

  it('returns 400 when Invalid PIN error is thrown', async () => {
    mockDeposit.mockRejectedValueOnce(
      new Error('Invalid PIN. Transaction rejected.'),
    );

    const request = buildPostRequest(DEPOSIT_URL, validDepositPayload);
    const response = await depositPOST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid PIN');
  });

  it('returns 502 when on-chain failure occurs', async () => {
    mockDeposit.mockRejectedValueOnce(
      new Error('Pool deposit failed on-chain: insufficient funds'),
    );

    const request = buildPostRequest(DEPOSIT_URL, validDepositPayload);
    const response = await depositPOST(request);

    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.error).toContain('Pool deposit failed on-chain');
  });

  it('returns 500 for unexpected errors', async () => {
    mockDeposit.mockRejectedValueOnce(
      new Error('Database connection failed'),
    );

    const request = buildPostRequest(DEPOSIT_URL, validDepositPayload);
    const response = await depositPOST(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('unexpected error');
  });
});

// ─── Withdraw Route Tests ────────────────────────────────────────────────────

describe('POST /api/pools/withdraw', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 with amountA, amountB, and transactionHash on success', async () => {
    mockWithdraw.mockResolvedValueOnce({
      amountA: '800000',
      amountB: '1600000',
      transactionHash: 'tx-hash-withdraw',
    });

    const request = buildPostRequest(WITHDRAW_URL, validWithdrawPayload);
    const response = await withdrawPOST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.amountA).toBe('800000');
    expect(data.amountB).toBe('1600000');
    expect(data.transactionHash).toBe('tx-hash-withdraw');
  });

  it('calls withdraw with correct parameters', async () => {
    mockWithdraw.mockResolvedValueOnce({
      amountA: '800000',
      amountB: '1600000',
      transactionHash: 'tx-hash-withdraw',
    });

    const request = buildPostRequest(WITHDRAW_URL, validWithdrawPayload);
    await withdrawPOST(request);

    expect(mockWithdraw).toHaveBeenCalledWith({
      poolContractId: 'CPOOL_CONTRACT_1',
      shares: '500000',
      merchantId: 'user-1',
      pin: '1234',
    });
  });

  it('returns 403 when CSRF token is missing', async () => {
    const request = buildPostRequest(WITHDRAW_URL, validWithdrawPayload, {
      omitCsrf: true,
    });
    const response = await withdrawPOST(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('CSRF');
    expect(mockWithdraw).not.toHaveBeenCalled();
  });

  it('returns 403 for USER role (non-MERCHANT rejected)', async () => {
    const request = buildPostRequest(WITHDRAW_URL, validWithdrawPayload, {
      role: 'USER',
    });
    const response = await withdrawPOST(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('Forbidden');
    expect(mockWithdraw).not.toHaveBeenCalled();
  });

  it('returns 403 for ADMIN role', async () => {
    const request = buildPostRequest(WITHDRAW_URL, validWithdrawPayload, {
      role: 'ADMIN',
    });
    const response = await withdrawPOST(request);

    expect(response.status).toBe(403);
    expect(mockWithdraw).not.toHaveBeenCalled();
  });

  it('returns 400 when shares is not a positive numeric string', async () => {
    const request = buildPostRequest(WITHDRAW_URL, {
      ...validWithdrawPayload,
      shares: '0',
    });
    const response = await withdrawPOST(request);

    expect(response.status).toBe(400);
    expect(mockWithdraw).not.toHaveBeenCalled();
  });

  it('returns 400 when pin is invalid (too long)', async () => {
    const request = buildPostRequest(WITHDRAW_URL, {
      ...validWithdrawPayload,
      pin: '1234567',
    });
    const response = await withdrawPOST(request);

    expect(response.status).toBe(400);
    expect(mockWithdraw).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON body', async () => {
    const request = new Request(WITHDRAW_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': 'test-csrf-token',
        'x-user-id': 'user-1',
        'x-user-role': 'MERCHANT',
      },
      body: 'not-valid-json{{{',
    });
    const response = await withdrawPOST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid JSON');
  });

  it('returns 500 for unexpected errors', async () => {
    mockWithdraw.mockRejectedValueOnce(
      new Error('Database connection failed'),
    );

    const request = buildPostRequest(WITHDRAW_URL, validWithdrawPayload);
    const response = await withdrawPOST(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('unexpected error');
  });
});

// ─── Swap Route Tests ────────────────────────────────────────────────────────

describe('POST /api/pools/swap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 with swap result on success', async () => {
    mockSwap.mockResolvedValueOnce({
      outputAmount: '95000',
      effectiveRate: '0.95',
      feeAmount: '300',
      transactionHash: 'tx-hash-swap',
    });

    const request = buildPostRequest(SWAP_URL, validSwapPayload);
    const response = await swapPOST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.outputAmount).toBe('95000');
    expect(data.effectiveRate).toBe('0.95');
    expect(data.feeAmount).toBe('300');
    expect(data.transactionHash).toBe('tx-hash-swap');
  });

  it('calls swap with correct parameters', async () => {
    mockSwap.mockResolvedValueOnce({
      outputAmount: '95000',
      effectiveRate: '0.95',
      feeAmount: '300',
      transactionHash: 'tx-hash-swap',
    });

    const request = buildPostRequest(SWAP_URL, validSwapPayload);
    await swapPOST(request);

    expect(mockSwap).toHaveBeenCalledWith({
      poolContractId: 'CPOOL_CONTRACT_1',
      inputToken: 'CTOKEN_A',
      inputAmount: '100000',
      minOutputAmount: '90000',
      userId: 'user-1',
      pin: '1234',
    });
  });

  it('allows USER role to swap', async () => {
    mockSwap.mockResolvedValueOnce({
      outputAmount: '95000',
      effectiveRate: '0.95',
      feeAmount: '300',
      transactionHash: 'tx-hash-swap',
    });

    const request = buildPostRequest(SWAP_URL, validSwapPayload, {
      role: 'USER',
    });
    const response = await swapPOST(request);

    expect(response.status).toBe(200);
  });

  it('allows MERCHANT role to swap', async () => {
    mockSwap.mockResolvedValueOnce({
      outputAmount: '95000',
      effectiveRate: '0.95',
      feeAmount: '300',
      transactionHash: 'tx-hash-swap',
    });

    const request = buildPostRequest(SWAP_URL, validSwapPayload, {
      role: 'MERCHANT',
    });
    const response = await swapPOST(request);

    expect(response.status).toBe(200);
  });

  it('returns 403 for ADMIN role', async () => {
    const request = buildPostRequest(SWAP_URL, validSwapPayload, {
      role: 'ADMIN',
    });
    const response = await swapPOST(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('Forbidden');
    expect(mockSwap).not.toHaveBeenCalled();
  });

  it('returns 403 when CSRF token is missing', async () => {
    const request = buildPostRequest(SWAP_URL, validSwapPayload, {
      omitCsrf: true,
    });
    const response = await swapPOST(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('CSRF');
    expect(mockSwap).not.toHaveBeenCalled();
  });

  it('returns 400 when slippage protection error is thrown (not 502)', async () => {
    mockSwap.mockRejectedValueOnce(
      new Error('Slippage protection: estimated output 80000 is below minimum 90000. Swap rejected.'),
    );

    const request = buildPostRequest(SWAP_URL, validSwapPayload);
    const response = await swapPOST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Slippage protection');
  });

  it('returns 502 when on-chain swap failure occurs', async () => {
    mockSwap.mockRejectedValueOnce(
      new Error('Swap transaction failed on-chain: contract execution error'),
    );

    const request = buildPostRequest(SWAP_URL, validSwapPayload);
    const response = await swapPOST(request);

    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.error).toContain('Swap transaction failed on-chain');
  });

  it('returns 400 when Invalid PIN error is thrown', async () => {
    mockSwap.mockRejectedValueOnce(
      new Error('Invalid PIN. Transaction rejected.'),
    );

    const request = buildPostRequest(SWAP_URL, validSwapPayload);
    const response = await swapPOST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid PIN');
  });

  it('returns 400 when inputAmount is not a positive numeric string', async () => {
    const request = buildPostRequest(SWAP_URL, {
      ...validSwapPayload,
      inputAmount: '0',
    });
    const response = await swapPOST(request);

    expect(response.status).toBe(400);
    expect(mockSwap).not.toHaveBeenCalled();
  });

  it('returns 400 when inputToken is empty', async () => {
    const request = buildPostRequest(SWAP_URL, {
      ...validSwapPayload,
      inputToken: '',
    });
    const response = await swapPOST(request);

    expect(response.status).toBe(400);
    expect(mockSwap).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON body', async () => {
    const request = new Request(SWAP_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': 'test-csrf-token',
        'x-user-id': 'user-1',
        'x-user-role': 'MERCHANT',
      },
      body: 'not-valid-json{{{',
    });
    const response = await swapPOST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid JSON');
  });

  it('returns 500 for unexpected errors', async () => {
    mockSwap.mockRejectedValueOnce(
      new Error('Database connection failed'),
    );

    const request = buildPostRequest(SWAP_URL, validSwapPayload);
    const response = await swapPOST(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('unexpected error');
  });
});

// ─── Positions Route Tests ───────────────────────────────────────────────────

describe('GET /api/pools/positions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 with LP positions on success', async () => {
    const mockPositions = [
      {
        id: 'pos-1',
        poolContractId: 'CPOOL_1',
        shares: { toString: () => '1000000' },
        tokenAContractId: 'CTOKEN_A',
        tokenBContractId: 'CTOKEN_B',
        createdAt: new Date('2025-01-01'),
        updatedAt: new Date('2025-01-02'),
      },
      {
        id: 'pos-2',
        poolContractId: 'CPOOL_2',
        shares: { toString: () => '500000' },
        tokenAContractId: 'CTOKEN_C',
        tokenBContractId: 'CTOKEN_D',
        createdAt: new Date('2025-01-03'),
        updatedAt: new Date('2025-01-04'),
      },
    ];
    mockPrisma.lPPosition.findMany.mockResolvedValueOnce(mockPositions as never);

    const request = buildGetRequest(POSITIONS_URL);
    const response = await positionsGET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(2);
    expect(data[0].poolContractId).toBe('CPOOL_1');
    expect(data[0].shares).toBe('1000000');
    expect(data[1].poolContractId).toBe('CPOOL_2');
    expect(data[1].shares).toBe('500000');
  });

  it('returns 200 with empty array when merchant has no positions', async () => {
    mockPrisma.lPPosition.findMany.mockResolvedValueOnce([] as never);

    const request = buildGetRequest(POSITIONS_URL);
    const response = await positionsGET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });

  it('queries positions for the authenticated merchant', async () => {
    mockPrisma.lPPosition.findMany.mockResolvedValueOnce([] as never);

    const request = buildGetRequest(POSITIONS_URL, { userId: 'merchant-42' });
    await positionsGET(request);

    expect(mockPrisma.lPPosition.findMany).toHaveBeenCalledWith({
      where: { merchantId: 'merchant-42' },
      select: {
        id: true,
        poolContractId: true,
        shares: true,
        tokenAContractId: true,
        tokenBContractId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('returns 403 for USER role (non-MERCHANT rejected)', async () => {
    const request = buildGetRequest(POSITIONS_URL, { role: 'USER' });
    const response = await positionsGET(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('Forbidden');
    expect(mockPrisma.lPPosition.findMany).not.toHaveBeenCalled();
  });

  it('returns 403 for ADMIN role', async () => {
    const request = buildGetRequest(POSITIONS_URL, { role: 'ADMIN' });
    const response = await positionsGET(request);

    expect(response.status).toBe(403);
    expect(mockPrisma.lPPosition.findMany).not.toHaveBeenCalled();
  });

  it('returns 500 for unexpected errors', async () => {
    mockPrisma.lPPosition.findMany.mockRejectedValueOnce(
      new Error('Database connection failed') as never,
    );

    const request = buildGetRequest(POSITIONS_URL);
    const response = await positionsGET(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('unexpected error');
  });
});
