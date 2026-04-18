/**
 * Unit tests for ContractService.
 *
 * Mocks the @stellar/stellar-sdk and its rpc module to test Soroban contract
 * deployment, invocation, simulation, inter-contract authorization, and XDR
 * serialization/deserialization without hitting the real Soroban testnet.
 *
 * @see Requirements 4.1, 4.2, 4.4, 5.1, 5.4, 6.4
 */

import { jest } from '@jest/globals';

// ─── Mock setup ──────────────────────────────────────────────────────────────

const mockGetAccount = jest.fn();
const mockPrepareTransaction = jest.fn();
const mockSendTransaction = jest.fn();
const mockPollTransaction = jest.fn();
const mockSimulateTransaction = jest.fn();
const mockSign = jest.fn();

const mockAddOperation = jest.fn();
const mockSetTimeout = jest.fn();
const mockBuild = jest.fn();

// Track the built transaction for signing
const mockBuiltTransaction = {
  sign: mockSign,
  operations: [] as unknown[],
};

// Mock xdr types used in the service
const mockScVal = { toXDR: jest.fn(() => 'mock-xdr') };
const mockScAddress = { toXDR: jest.fn(() => 'mock-sc-address') };
const mockReturnValueBytes = jest.fn(() => Buffer.from('mock-wasm-hash'));
const mockReturnValue = {
  bytes: mockReturnValueBytes,
  toXDR: jest.fn(() => 'mock-return-xdr'),
};
const mockContractReturnValue = {
  toXDR: jest.fn(() => 'mock-contract-return-xdr'),
};

// Mock Address.fromScVal to return a contract address
const mockFromScVal = jest.fn(() => ({
  toString: () => 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHK3M',
}));

const mockToScAddress = jest.fn(() => mockScAddress);
const mockAddressConstructor = jest.fn().mockImplementation(() => ({
  toScAddress: mockToScAddress,
}));

// Mock Contract.call
const mockContractCall = jest.fn(() => 'mock-contract-call-operation');
const mockContractConstructor = jest.fn().mockImplementation(() => ({
  call: mockContractCall,
}));

// Mock Account constructor
const mockAccountConstructor = jest.fn().mockImplementation(() => ({
  accountId: jest.fn(() => 'GDUMMY'),
  sequenceNumber: jest.fn(() => '0'),
}));

// Mock xdr namespace
const mockSorobanAuthorizedInvocation = jest.fn().mockImplementation((args: unknown) => ({
  ...args,
  _type: 'SorobanAuthorizedInvocation',
}));

const mockSorobanAuthorizationEntry = jest.fn().mockImplementation((args: unknown) => ({
  ...args,
  _type: 'SorobanAuthorizationEntry',
}));

const mockSorobanAuthorizedFunctionTypeContractFn = jest.fn((args: unknown) => ({
  _type: 'sorobanAuthorizedFunctionTypeContractFn',
  ...args,
}));

const mockSorobanCredentialsSourceAccount = jest.fn(() => ({
  _type: 'sorobanCredentialsSourceAccount',
}));

const mockInvokeContractArgs = jest.fn().mockImplementation((args: unknown) => ({
  ...args,
  _type: 'InvokeContractArgs',
}));

const mockScvVoid = jest.fn(() => ({ _type: 'scvVoid' }));

// Mock rpc module
const mockIsSimulationError = jest.fn();
const mockAssembleTransaction = jest.fn();

jest.mock('@stellar/stellar-sdk', () => {
  // Build a chainable builder mock
  const builderInstance = {
    addOperation: mockAddOperation,
    setTimeout: mockSetTimeout,
    build: mockBuild,
  };
  mockAddOperation.mockReturnValue(builderInstance);
  mockSetTimeout.mockReturnValue(builderInstance);
  mockBuild.mockReturnValue(mockBuiltTransaction);

  return {
    __esModule: true,
    Keypair: {
      random: jest.fn(() => ({
        publicKey: jest.fn(() => 'GDUMMY_RANDOM_PUBLIC'),
        secret: jest.fn(() => 'SDUMMY_RANDOM_SECRET'),
      })),
      fromSecret: jest.fn(() => ({
        publicKey: jest.fn(() => 'GDEPLOYER_PUBLIC_KEY_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),
        secret: jest.fn(() => 'SDEPLOYER_SECRET'),
      })),
    },
    TransactionBuilder: jest.fn().mockImplementation(() => builderInstance),
    Networks: {
      TESTNET: 'Test SDF Network ; September 2015',
    },
    Operation: {
      uploadContractWasm: jest.fn(() => 'mock-upload-wasm-op'),
      createCustomContract: jest.fn(() => 'mock-create-contract-op'),
      invokeHostFunction: jest.fn(() => 'mock-invoke-host-fn-op'),
    },
    Contract: mockContractConstructor,
    Account: mockAccountConstructor,
    Address: Object.assign(mockAddressConstructor, {
      fromScVal: mockFromScVal,
    }),
    nativeToScVal: jest.fn((val: unknown, opts?: unknown) => ({
      _type: 'nativeToScVal',
      value: val,
      opts,
    })),
    scValToNative: jest.fn((val: unknown) => ({
      _type: 'scValToNative',
      value: val,
    })),
    BASE_FEE: '100',
    xdr: {
      ScVal: {
        scvVoid: mockScvVoid,
      },
      SorobanAuthorizedInvocation: mockSorobanAuthorizedInvocation,
      SorobanAuthorizationEntry: mockSorobanAuthorizationEntry,
      SorobanAuthorizedFunction: {
        sorobanAuthorizedFunctionTypeContractFn: mockSorobanAuthorizedFunctionTypeContractFn,
      },
      SorobanCredentials: {
        sorobanCredentialsSourceAccount: mockSorobanCredentialsSourceAccount,
      },
      InvokeContractArgs: mockInvokeContractArgs,
    },
    rpc: {
      Server: jest.fn().mockImplementation(() => ({
        getAccount: mockGetAccount,
        prepareTransaction: mockPrepareTransaction,
        sendTransaction: mockSendTransaction,
        pollTransaction: mockPollTransaction,
        simulateTransaction: mockSimulateTransaction,
      })),
      Api: {
        isSimulationError: mockIsSimulationError,
      },
      assembleTransaction: mockAssembleTransaction,
    },
  };
});

// Import the module under test — mocks are already in place
import {
  deployContract,
  invokeContract,
  simulateContract,
  getSorobanRpcUrl,
  getSorobanServer,
  nativeToScVal,
  scValToNative,
  xdr,
} from '../contract.service';

import type { SubContractAuth } from '../contract.service';

// ─── Environment setup ──────────────────────────────────────────────────────

beforeAll(() => {
  process.env.SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';
  process.env.STELLAR_NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
});

afterAll(() => {
  delete process.env.SOROBAN_RPC_URL;
  delete process.env.STELLAR_NETWORK_PASSPHRASE;
});

beforeEach(() => {
  jest.clearAllMocks();

  // Restore chainable builder mocks after clearAllMocks
  const builderInstance = {
    addOperation: mockAddOperation,
    setTimeout: mockSetTimeout,
    build: mockBuild,
  };
  mockAddOperation.mockReturnValue(builderInstance);
  mockSetTimeout.mockReturnValue(builderInstance);
  mockBuild.mockReturnValue(mockBuiltTransaction);
  mockBuiltTransaction.operations = [];
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ContractService', () => {
  // ─── Helpers ─────────────────────────────────────────────────────────────

  describe('getSorobanRpcUrl()', () => {
    it('returns the SOROBAN_RPC_URL from environment', () => {
      const url = getSorobanRpcUrl();
      expect(url).toBe('https://soroban-testnet.stellar.org');
    });

    it('falls back to default when env var is not set', () => {
      const original = process.env.SOROBAN_RPC_URL;
      delete process.env.SOROBAN_RPC_URL;

      const url = getSorobanRpcUrl();
      expect(url).toBe('https://soroban-testnet.stellar.org');

      process.env.SOROBAN_RPC_URL = original;
    });
  });

  describe('getSorobanServer()', () => {
    it('returns a Server instance', () => {
      const server = getSorobanServer();
      expect(server).toBeDefined();
      expect(server).toHaveProperty('getAccount');
      expect(server).toHaveProperty('sendTransaction');
    });
  });

  // ─── deployContract ──────────────────────────────────────────────────────

  describe('deployContract()', () => {
    const wasmBuffer = Buffer.from('mock-wasm-binary');
    const deployerSecret = 'SDEPLOYER_SECRET_KEY_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

    function setupSuccessfulDeploy() {
      // Step 1: getAccount for upload
      mockGetAccount.mockResolvedValueOnce({
        accountId: () => 'GDEPLOYER',
        sequenceNumber: () => '100',
      });

      // prepareTransaction for upload
      mockPrepareTransaction.mockResolvedValueOnce(mockBuiltTransaction);

      // sendTransaction for upload
      mockSendTransaction.mockResolvedValueOnce({
        status: 'PENDING',
        hash: 'upload-tx-hash-123',
      });

      // pollTransaction for upload
      mockPollTransaction.mockResolvedValueOnce({
        status: 'SUCCESS',
        returnValue: mockReturnValue,
      });

      // Step 2: getAccount for instantiation
      mockGetAccount.mockResolvedValueOnce({
        accountId: () => 'GDEPLOYER',
        sequenceNumber: () => '101',
      });

      // prepareTransaction for instantiation
      mockPrepareTransaction.mockResolvedValueOnce(mockBuiltTransaction);

      // sendTransaction for instantiation
      mockSendTransaction.mockResolvedValueOnce({
        status: 'PENDING',
        hash: 'create-tx-hash-456',
      });

      // pollTransaction for instantiation
      mockPollTransaction.mockResolvedValueOnce({
        status: 'SUCCESS',
        returnValue: mockContractReturnValue,
      });
    }

    it('returns contractId and transactionHash on successful deployment', async () => {
      setupSuccessfulDeploy();

      const result = await deployContract(wasmBuffer, deployerSecret);

      expect(result).toHaveProperty('contractId');
      expect(result).toHaveProperty('transactionHash');
      expect(result.contractId).toBe('CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHK3M');
      expect(result.transactionHash).toBe('create-tx-hash-456');
    });

    it('calls getAccount twice (upload + instantiation)', async () => {
      setupSuccessfulDeploy();

      await deployContract(wasmBuffer, deployerSecret);

      expect(mockGetAccount).toHaveBeenCalledTimes(2);
    });

    it('signs both upload and instantiation transactions', async () => {
      setupSuccessfulDeploy();

      await deployContract(wasmBuffer, deployerSecret);

      expect(mockSign).toHaveBeenCalledTimes(2);
    });

    it('throws descriptive error when upload is rejected by network', async () => {
      mockGetAccount.mockResolvedValueOnce({
        accountId: () => 'GDEPLOYER',
        sequenceNumber: () => '100',
      });
      mockPrepareTransaction.mockResolvedValueOnce(mockBuiltTransaction);
      mockSendTransaction.mockResolvedValueOnce({
        status: 'ERROR',
        errorResult: { toXDR: jest.fn(() => 'error-xdr-data') },
      });

      await expect(deployContract(wasmBuffer, deployerSecret)).rejects.toThrow(
        /Contract WASM upload rejected by network: error-xdr-data/
      );
    });

    it('throws descriptive error when upload is rejected with no errorResult', async () => {
      mockGetAccount.mockResolvedValueOnce({
        accountId: () => 'GDEPLOYER',
        sequenceNumber: () => '100',
      });
      mockPrepareTransaction.mockResolvedValueOnce(mockBuiltTransaction);
      mockSendTransaction.mockResolvedValueOnce({
        status: 'ERROR',
        errorResult: null,
      });

      await expect(deployContract(wasmBuffer, deployerSecret)).rejects.toThrow(
        /Contract WASM upload rejected by network: unknown/
      );
    });

    it('throws when upload poll returns non-SUCCESS status', async () => {
      mockGetAccount.mockResolvedValueOnce({
        accountId: () => 'GDEPLOYER',
        sequenceNumber: () => '100',
      });
      mockPrepareTransaction.mockResolvedValueOnce(mockBuiltTransaction);
      mockSendTransaction.mockResolvedValueOnce({
        status: 'PENDING',
        hash: 'upload-tx-hash',
      });
      mockPollTransaction.mockResolvedValueOnce({
        status: 'FAILED',
        diagnosticEventsXdr: [{ toXDR: jest.fn(() => 'diag-event-1') }],
      });

      await expect(deployContract(wasmBuffer, deployerSecret)).rejects.toThrow(
        /Contract WASM upload failed with status FAILED/
      );
    });

    it('throws when upload succeeds but no return value (WASM hash)', async () => {
      mockGetAccount.mockResolvedValueOnce({
        accountId: () => 'GDEPLOYER',
        sequenceNumber: () => '100',
      });
      mockPrepareTransaction.mockResolvedValueOnce(mockBuiltTransaction);
      mockSendTransaction.mockResolvedValueOnce({
        status: 'PENDING',
        hash: 'upload-tx-hash',
      });
      mockPollTransaction.mockResolvedValueOnce({
        status: 'SUCCESS',
        returnValue: null,
      });

      await expect(deployContract(wasmBuffer, deployerSecret)).rejects.toThrow(
        /no return value \(WASM hash\)/
      );
    });

    it('throws when instantiation is rejected by network', async () => {
      // Successful upload
      mockGetAccount.mockResolvedValueOnce({
        accountId: () => 'GDEPLOYER',
        sequenceNumber: () => '100',
      });
      mockPrepareTransaction.mockResolvedValueOnce(mockBuiltTransaction);
      mockSendTransaction.mockResolvedValueOnce({
        status: 'PENDING',
        hash: 'upload-tx-hash',
      });
      mockPollTransaction.mockResolvedValueOnce({
        status: 'SUCCESS',
        returnValue: mockReturnValue,
      });

      // Failed instantiation
      mockGetAccount.mockResolvedValueOnce({
        accountId: () => 'GDEPLOYER',
        sequenceNumber: () => '101',
      });
      mockPrepareTransaction.mockResolvedValueOnce(mockBuiltTransaction);
      mockSendTransaction.mockResolvedValueOnce({
        status: 'ERROR',
        errorResult: { toXDR: jest.fn(() => 'instantiation-error') },
      });

      await expect(deployContract(wasmBuffer, deployerSecret)).rejects.toThrow(
        /Contract instantiation rejected by network: instantiation-error/
      );
    });

    it('throws when instantiation poll returns non-SUCCESS status', async () => {
      // Successful upload
      mockGetAccount.mockResolvedValueOnce({
        accountId: () => 'GDEPLOYER',
        sequenceNumber: () => '100',
      });
      mockPrepareTransaction.mockResolvedValueOnce(mockBuiltTransaction);
      mockSendTransaction.mockResolvedValueOnce({
        status: 'PENDING',
        hash: 'upload-tx-hash',
      });
      mockPollTransaction.mockResolvedValueOnce({
        status: 'SUCCESS',
        returnValue: mockReturnValue,
      });

      // Instantiation fails on-chain
      mockGetAccount.mockResolvedValueOnce({
        accountId: () => 'GDEPLOYER',
        sequenceNumber: () => '101',
      });
      mockPrepareTransaction.mockResolvedValueOnce(mockBuiltTransaction);
      mockSendTransaction.mockResolvedValueOnce({
        status: 'PENDING',
        hash: 'create-tx-hash',
      });
      mockPollTransaction.mockResolvedValueOnce({
        status: 'FAILED',
        diagnosticEventsXdr: [{ toXDR: jest.fn(() => 'diag-1') }],
      });

      await expect(deployContract(wasmBuffer, deployerSecret)).rejects.toThrow(
        /Contract instantiation failed with status FAILED/
      );
    });

    it('throws when instantiation succeeds but no return value', async () => {
      // Successful upload
      mockGetAccount.mockResolvedValueOnce({
        accountId: () => 'GDEPLOYER',
        sequenceNumber: () => '100',
      });
      mockPrepareTransaction.mockResolvedValueOnce(mockBuiltTransaction);
      mockSendTransaction.mockResolvedValueOnce({
        status: 'PENDING',
        hash: 'upload-tx-hash',
      });
      mockPollTransaction.mockResolvedValueOnce({
        status: 'SUCCESS',
        returnValue: mockReturnValue,
      });

      // Instantiation succeeds but no return value
      mockGetAccount.mockResolvedValueOnce({
        accountId: () => 'GDEPLOYER',
        sequenceNumber: () => '101',
      });
      mockPrepareTransaction.mockResolvedValueOnce(mockBuiltTransaction);
      mockSendTransaction.mockResolvedValueOnce({
        status: 'PENDING',
        hash: 'create-tx-hash',
      });
      mockPollTransaction.mockResolvedValueOnce({
        status: 'SUCCESS',
        returnValue: null,
      });

      await expect(deployContract(wasmBuffer, deployerSecret)).rejects.toThrow(
        /no return value \(contract address\)/
      );
    });
  });

  // ─── invokeContract ────────────────────────────────────────────────────

  describe('invokeContract()', () => {
    const contractId = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHK3M';
    const functionName = 'transfer';
    const args = [mockScVal as unknown as typeof xdr.ScVal.prototype];
    const callerSecret = 'SCALLER_SECRET_KEY_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

    function setupSuccessfulInvoke() {
      // getAccount
      mockGetAccount.mockResolvedValueOnce({
        accountId: () => 'GCALLER',
        sequenceNumber: () => '200',
      });

      // simulateTransaction (for preparing the tx)
      mockIsSimulationError.mockReturnValueOnce(false);
      mockSimulateTransaction.mockResolvedValueOnce({
        result: { retval: mockContractReturnValue },
      });

      // assembleTransaction returns a builder-like object
      const assembledTx = {
        build: jest.fn(() => ({
          sign: mockSign,
          operations: [],
        })),
      };
      mockAssembleTransaction.mockReturnValueOnce(assembledTx);

      // sendTransaction
      mockSendTransaction.mockResolvedValueOnce({
        status: 'PENDING',
        hash: 'invoke-tx-hash-789',
      });

      // pollTransaction
      mockPollTransaction.mockResolvedValueOnce({
        status: 'SUCCESS',
        returnValue: mockContractReturnValue,
      });
    }

    it('returns transactionHash and returnValue on success', async () => {
      setupSuccessfulInvoke();

      const result = await invokeContract(contractId, functionName, args, callerSecret);

      expect(result).toHaveProperty('transactionHash');
      expect(result).toHaveProperty('returnValue');
      expect(result.transactionHash).toBe('invoke-tx-hash-789');
    });

    it('creates a Contract instance with the provided contractId', async () => {
      setupSuccessfulInvoke();

      await invokeContract(contractId, functionName, args, callerSecret);

      expect(mockContractConstructor).toHaveBeenCalledWith(contractId);
    });

    it('calls contract.call with the function name and args', async () => {
      setupSuccessfulInvoke();

      await invokeContract(contractId, functionName, args, callerSecret);

      expect(mockContractCall).toHaveBeenCalledWith(functionName, ...args);
    });

    it('throws descriptive error when network rejects the transaction', async () => {
      mockGetAccount.mockResolvedValueOnce({
        accountId: () => 'GCALLER',
        sequenceNumber: () => '200',
      });
      mockIsSimulationError.mockReturnValueOnce(false);
      mockSimulateTransaction.mockResolvedValueOnce({
        result: { retval: mockContractReturnValue },
      });
      const assembledTx = {
        build: jest.fn(() => ({
          sign: mockSign,
          operations: [],
        })),
      };
      mockAssembleTransaction.mockReturnValueOnce(assembledTx);

      mockSendTransaction.mockResolvedValueOnce({
        status: 'ERROR',
        errorResult: { toXDR: jest.fn(() => 'invoke-error-xdr') },
        diagnosticEvents: [{ toXDR: jest.fn(() => 'diag-event') }],
      });

      await expect(
        invokeContract(contractId, functionName, args, callerSecret)
      ).rejects.toThrow(/Contract invocation rejected by network: invoke-error-xdr/);
    });

    it('throws when transaction fails on-chain with FAILED status', async () => {
      mockGetAccount.mockResolvedValueOnce({
        accountId: () => 'GCALLER',
        sequenceNumber: () => '200',
      });
      mockIsSimulationError.mockReturnValueOnce(false);
      mockSimulateTransaction.mockResolvedValueOnce({
        result: { retval: mockContractReturnValue },
      });
      const assembledTx = {
        build: jest.fn(() => ({
          sign: mockSign,
          operations: [],
        })),
      };
      mockAssembleTransaction.mockReturnValueOnce(assembledTx);

      mockSendTransaction.mockResolvedValueOnce({
        status: 'PENDING',
        hash: 'invoke-tx-hash',
      });
      mockPollTransaction.mockResolvedValueOnce({
        status: 'FAILED',
        diagnosticEventsXdr: [{ toXDR: jest.fn(() => 'on-chain-diag') }],
      });

      await expect(
        invokeContract(contractId, functionName, args, callerSecret)
      ).rejects.toThrow(/Contract invocation failed on-chain with status FAILED/);
    });

    it('throws when simulation returns an auth-related error', async () => {
      mockGetAccount.mockResolvedValueOnce({
        accountId: () => 'GCALLER',
        sequenceNumber: () => '200',
      });
      mockIsSimulationError.mockReturnValueOnce(true);
      mockSimulateTransaction.mockResolvedValueOnce({
        error: 'missing authorization for contract call',
        events: [],
      });

      await expect(
        invokeContract(contractId, functionName, args, callerSecret)
      ).rejects.toThrow(/missing authorization/);
    });

    it('throws generic simulation error for non-auth failures', async () => {
      mockGetAccount.mockResolvedValueOnce({
        accountId: () => 'GCALLER',
        sequenceNumber: () => '200',
      });
      mockIsSimulationError.mockReturnValueOnce(true);
      mockSimulateTransaction.mockResolvedValueOnce({
        error: 'contract execution trapped',
        events: [],
      });

      await expect(
        invokeContract(contractId, functionName, args, callerSecret)
      ).rejects.toThrow(/Contract invocation simulation failed: contract execution trapped/);
    });

    it('returns scvVoid as returnValue when poll has no returnValue', async () => {
      mockGetAccount.mockResolvedValueOnce({
        accountId: () => 'GCALLER',
        sequenceNumber: () => '200',
      });
      mockIsSimulationError.mockReturnValueOnce(false);
      mockSimulateTransaction.mockResolvedValueOnce({
        result: { retval: mockContractReturnValue },
      });
      const assembledTx = {
        build: jest.fn(() => ({
          sign: mockSign,
          operations: [],
        })),
      };
      mockAssembleTransaction.mockReturnValueOnce(assembledTx);

      mockSendTransaction.mockResolvedValueOnce({
        status: 'PENDING',
        hash: 'invoke-tx-hash',
      });
      mockPollTransaction.mockResolvedValueOnce({
        status: 'SUCCESS',
        returnValue: undefined,
      });

      const result = await invokeContract(contractId, functionName, args, callerSecret);

      expect(result.returnValue).toEqual({ _type: 'scvVoid' });
    });
  });

  // ─── simulateContract ──────────────────────────────────────────────────

  describe('simulateContract()', () => {
    const contractId = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHK3M';
    const functionName = 'balance';
    const args = [mockScVal as unknown as typeof xdr.ScVal.prototype];

    it('returns the simulation return value for read-only calls', async () => {
      mockIsSimulationError.mockReturnValueOnce(false);
      mockSimulateTransaction.mockResolvedValueOnce({
        result: { retval: mockContractReturnValue },
      });

      const result = await simulateContract(contractId, functionName, args);

      expect(result).toHaveProperty('returnValue');
      expect(result.returnValue).toBe(mockContractReturnValue);
    });

    it('creates a Contract instance with the provided contractId', async () => {
      mockIsSimulationError.mockReturnValueOnce(false);
      mockSimulateTransaction.mockResolvedValueOnce({
        result: { retval: mockContractReturnValue },
      });

      await simulateContract(contractId, functionName, args);

      expect(mockContractConstructor).toHaveBeenCalledWith(contractId);
    });

    it('uses a dummy account for simulation (no real account needed)', async () => {
      mockIsSimulationError.mockReturnValueOnce(false);
      mockSimulateTransaction.mockResolvedValueOnce({
        result: { retval: mockContractReturnValue },
      });

      await simulateContract(contractId, functionName, args);

      // Account constructor should be called with a random public key and sequence '0'
      expect(mockAccountConstructor).toHaveBeenCalledWith(
        expect.any(String),
        '0'
      );
    });

    it('does not submit a transaction to the network', async () => {
      mockIsSimulationError.mockReturnValueOnce(false);
      mockSimulateTransaction.mockResolvedValueOnce({
        result: { retval: mockContractReturnValue },
      });

      await simulateContract(contractId, functionName, args);

      expect(mockSendTransaction).not.toHaveBeenCalled();
      expect(mockGetAccount).not.toHaveBeenCalled();
    });

    it('throws when simulation returns an error', async () => {
      mockIsSimulationError.mockReturnValueOnce(true);
      mockSimulateTransaction.mockResolvedValueOnce({
        error: 'contract function not found',
      });

      await expect(
        simulateContract(contractId, functionName, args)
      ).rejects.toThrow(/Contract simulation failed: contract function not found/);
    });

    it('throws when simulation succeeds but no return value', async () => {
      mockIsSimulationError.mockReturnValueOnce(false);
      mockSimulateTransaction.mockResolvedValueOnce({
        result: null,
      });

      await expect(
        simulateContract(contractId, functionName, args)
      ).rejects.toThrow(/no return value was produced/);
    });

    it('throws when simulation result has no retval', async () => {
      mockIsSimulationError.mockReturnValueOnce(false);
      mockSimulateTransaction.mockResolvedValueOnce({
        result: { retval: null },
      });

      await expect(
        simulateContract(contractId, functionName, args)
      ).rejects.toThrow(/no return value was produced/);
    });
  });

  // ─── Inter-contract authorization ──────────────────────────────────────

  describe('Inter-contract authorization construction', () => {
    it('builds SorobanAuthorizedInvocation from SubContractAuth', async () => {
      const subAuth: SubContractAuth[] = [
        {
          contractId: 'CTOKEN_CONTRACT_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          functionName: 'transfer',
          args: [mockScVal as unknown as typeof xdr.ScVal.prototype],
        },
      ];

      // Setup a successful invoke with subAuth
      mockGetAccount
        .mockResolvedValueOnce({
          accountId: () => 'GCALLER',
          sequenceNumber: () => '200',
        })
        .mockResolvedValueOnce({
          accountId: () => 'GCALLER',
          sequenceNumber: () => '201',
        });

      mockIsSimulationError.mockReturnValueOnce(false);
      mockSimulateTransaction.mockResolvedValueOnce({
        result: { retval: mockContractReturnValue },
      });

      // assembleTransaction returns a tx with operations that have auth
      const assembledTx = {
        build: jest.fn(() => ({
          sign: mockSign,
          operations: [
            {
              auth: [],
              func: 'mock-host-func',
            },
          ],
        })),
      };
      mockAssembleTransaction.mockReturnValueOnce(assembledTx);

      // The rebuilt transaction with combined auth
      mockPrepareTransaction.mockResolvedValueOnce(mockBuiltTransaction);

      mockSendTransaction.mockResolvedValueOnce({
        status: 'PENDING',
        hash: 'inter-contract-tx-hash',
      });
      mockPollTransaction.mockResolvedValueOnce({
        status: 'SUCCESS',
        returnValue: mockContractReturnValue,
      });

      await invokeContract(
        'CPOOL_CONTRACT_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        'deposit',
        [mockScVal as unknown as typeof xdr.ScVal.prototype],
        'SCALLER_SECRET',
        subAuth
      );

      // Verify SorobanAuthorizedInvocation was constructed
      expect(mockSorobanAuthorizedInvocation).toHaveBeenCalled();
      // Verify SorobanAuthorizationEntry was constructed
      expect(mockSorobanAuthorizationEntry).toHaveBeenCalled();
      // Verify InvokeContractArgs was constructed with the sub-contract details
      expect(mockInvokeContractArgs).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: 'transfer',
        })
      );
    });

    it('handles nested sub-invocations recursively', async () => {
      const subAuth: SubContractAuth[] = [
        {
          contractId: 'COUTER_CONTRACT_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          functionName: 'outer_call',
          args: [],
          subInvocations: [
            {
              contractId: 'CINNER_CONTRACT_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
              functionName: 'inner_call',
              args: [],
            },
          ],
        },
      ];

      mockGetAccount
        .mockResolvedValueOnce({
          accountId: () => 'GCALLER',
          sequenceNumber: () => '200',
        })
        .mockResolvedValueOnce({
          accountId: () => 'GCALLER',
          sequenceNumber: () => '201',
        });

      mockIsSimulationError.mockReturnValueOnce(false);
      mockSimulateTransaction.mockResolvedValueOnce({
        result: { retval: mockContractReturnValue },
      });

      const assembledTx = {
        build: jest.fn(() => ({
          sign: mockSign,
          operations: [
            {
              auth: [],
              func: 'mock-host-func',
            },
          ],
        })),
      };
      mockAssembleTransaction.mockReturnValueOnce(assembledTx);
      mockPrepareTransaction.mockResolvedValueOnce(mockBuiltTransaction);

      mockSendTransaction.mockResolvedValueOnce({
        status: 'PENDING',
        hash: 'nested-auth-tx-hash',
      });
      mockPollTransaction.mockResolvedValueOnce({
        status: 'SUCCESS',
        returnValue: mockContractReturnValue,
      });

      await invokeContract(
        'CMAIN_CONTRACT_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        'complex_call',
        [],
        'SCALLER_SECRET',
        subAuth
      );

      // SorobanAuthorizedInvocation should be called twice: once for inner, once for outer
      expect(mockSorobanAuthorizedInvocation).toHaveBeenCalledTimes(2);
    });

    it('identifies missing authorization in simulation error', async () => {
      mockGetAccount.mockResolvedValueOnce({
        accountId: () => 'GCALLER',
        sequenceNumber: () => '200',
      });
      mockIsSimulationError.mockReturnValue(true);
      mockSimulateTransaction.mockResolvedValueOnce({
        error: 'missing Auth entry for sub-contract invocation',
        events: [{ toXDR: jest.fn(() => 'auth-event-xdr') }],
      });

      await expect(
        invokeContract(
          'CPOOL_CONTRACT',
          'deposit',
          [],
          'SCALLER_SECRET',
          []
        )
      ).rejects.toThrow(/missing authorization.*auth-event-xdr/i);

      // Reset to default
      mockIsSimulationError.mockReset();
    });
  });

  // ─── XDR serialization/deserialization ─────────────────────────────────

  describe('XDR serialization/deserialization', () => {
    it('re-exports nativeToScVal from @stellar/stellar-sdk', () => {
      expect(nativeToScVal).toBeDefined();
      expect(typeof nativeToScVal).toBe('function');
    });

    it('re-exports scValToNative from @stellar/stellar-sdk', () => {
      expect(scValToNative).toBeDefined();
      expect(typeof scValToNative).toBe('function');
    });

    it('re-exports xdr namespace from @stellar/stellar-sdk', () => {
      expect(xdr).toBeDefined();
      expect(xdr.ScVal).toBeDefined();
    });

    it('nativeToScVal converts native values to ScVal', () => {
      const result = nativeToScVal(42, { type: 'i128' });
      expect(result).toEqual({
        _type: 'nativeToScVal',
        value: 42,
        opts: { type: 'i128' },
      });
    });

    it('scValToNative converts ScVal back to native values', () => {
      const mockVal = { _type: 'someScVal' };
      const result = scValToNative(mockVal as unknown as typeof xdr.ScVal.prototype);
      expect(result).toEqual({
        _type: 'scValToNative',
        value: mockVal,
      });
    });
  });

  // ─── Error handling ────────────────────────────────────────────────────

  describe('Error handling', () => {
    it('includes diagnostic events in upload failure message', async () => {
      mockGetAccount.mockResolvedValueOnce({
        accountId: () => 'GDEPLOYER',
        sequenceNumber: () => '100',
      });
      mockPrepareTransaction.mockResolvedValueOnce(mockBuiltTransaction);
      mockSendTransaction.mockResolvedValueOnce({
        status: 'PENDING',
        hash: 'upload-tx-hash',
      });
      mockPollTransaction.mockResolvedValueOnce({
        status: 'FAILED',
        diagnosticEventsXdr: [
          { toXDR: jest.fn(() => 'diag-event-a') },
          { toXDR: jest.fn(() => 'diag-event-b') },
        ],
      });

      await expect(
        deployContract(Buffer.from('wasm'), 'SDEPLOYER_SECRET')
      ).rejects.toThrow(/diag-event-a, diag-event-b/);
    });

    it('handles upload failure with no diagnostics', async () => {
      mockGetAccount.mockResolvedValueOnce({
        accountId: () => 'GDEPLOYER',
        sequenceNumber: () => '100',
      });
      mockPrepareTransaction.mockResolvedValueOnce(mockBuiltTransaction);
      mockSendTransaction.mockResolvedValueOnce({
        status: 'PENDING',
        hash: 'upload-tx-hash',
      });
      mockPollTransaction.mockResolvedValueOnce({
        status: 'FAILED',
      });

      await expect(
        deployContract(Buffer.from('wasm'), 'SDEPLOYER_SECRET')
      ).rejects.toThrow(/no diagnostics/);
    });

    it('includes diagnostics in invocation network rejection', async () => {
      mockGetAccount.mockResolvedValueOnce({
        accountId: () => 'GCALLER',
        sequenceNumber: () => '200',
      });
      mockIsSimulationError.mockReturnValue(false);
      mockSimulateTransaction.mockResolvedValueOnce({
        result: { retval: mockContractReturnValue },
      });
      const assembledTx = {
        build: jest.fn(() => ({
          sign: mockSign,
          operations: [],
        })),
      };
      mockAssembleTransaction.mockReturnValueOnce(assembledTx);

      mockSendTransaction.mockResolvedValueOnce({
        status: 'ERROR',
        errorResult: { toXDR: jest.fn(() => 'err-xdr') },
        diagnosticEvents: [{ toXDR: jest.fn(() => 'diag-1') }],
      });

      await expect(
        invokeContract('CCONTRACT', 'fn', [], 'SCALLER')
      ).rejects.toThrow(/Diagnostics: diag-1/);

      mockIsSimulationError.mockReset();
    });

    it('handles invocation rejection with no errorResult or diagnostics', async () => {
      mockGetAccount.mockResolvedValueOnce({
        accountId: () => 'GCALLER',
        sequenceNumber: () => '200',
      });
      mockIsSimulationError.mockReturnValue(false);
      mockSimulateTransaction.mockResolvedValueOnce({
        result: { retval: mockContractReturnValue },
      });
      const assembledTx = {
        build: jest.fn(() => ({
          sign: mockSign,
          operations: [],
        })),
      };
      mockAssembleTransaction.mockReturnValueOnce(assembledTx);

      mockSendTransaction.mockResolvedValueOnce({
        status: 'ERROR',
        errorResult: null,
        diagnosticEvents: undefined,
      });

      await expect(
        invokeContract('CCONTRACT', 'fn', [], 'SCALLER')
      ).rejects.toThrow(/Contract invocation rejected by network: unknown/);

      mockIsSimulationError.mockReset();
    });

    it('reports missing auth info when simulation events are empty', async () => {
      mockGetAccount.mockResolvedValueOnce({
        accountId: () => 'GCALLER',
        sequenceNumber: () => '200',
      });
      mockIsSimulationError.mockReturnValue(true);
      mockSimulateTransaction.mockResolvedValueOnce({
        error: 'Auth required for sub-contract',
        events: [],
      });

      await expect(
        invokeContract('CCONTRACT', 'fn', [], 'SCALLER')
      ).rejects.toThrow(/unable to determine missing authorizations/);

      mockIsSimulationError.mockReset();
    });

    it('handles unexpected poll status for invocation', async () => {
      mockGetAccount.mockResolvedValueOnce({
        accountId: () => 'GCALLER',
        sequenceNumber: () => '200',
      });
      mockIsSimulationError.mockReturnValue(false);
      mockSimulateTransaction.mockResolvedValueOnce({
        result: { retval: mockContractReturnValue },
      });
      const assembledTx = {
        build: jest.fn(() => ({
          sign: mockSign,
          operations: [],
        })),
      };
      mockAssembleTransaction.mockReturnValueOnce(assembledTx);

      mockSendTransaction.mockResolvedValueOnce({
        status: 'PENDING',
        hash: 'invoke-tx-hash',
      });
      mockPollTransaction.mockResolvedValueOnce({
        status: 'NOT_FOUND',
      });

      await expect(
        invokeContract('CCONTRACT', 'fn', [], 'SCALLER')
      ).rejects.toThrow(/unexpected status: NOT_FOUND/);

      mockIsSimulationError.mockReset();
    });
  });
});
