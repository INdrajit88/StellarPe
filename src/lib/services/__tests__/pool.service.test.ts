/**
 * Unit tests for PoolService.
 *
 * Mocks ContractService, EncryptionService, PINService, Prisma, fs, and
 * @stellar/stellar-sdk to test liquidity pool deposit, withdraw, and swap
 * operations without hitting the real Soroban testnet or database.
 *
 * @see Requirements 8.2, 8.3, 8.5, 9.1, 9.4
 */

import { jest } from '@jest/globals';

// ─── Mock setup ──────────────────────────────────────────────────────────────

// Mock contract service functions
const mockDeployContract = jest.fn<
  (wasmBuffer: Buffer, deployerSecret: string) => Promise<{ contractId: string; transactionHash: string }>
>();
const mockInvokeContract = jest.fn<
  (contractId: string, functionName: string, args: unknown[], callerSecret: string, subAuth?: unknown[]) => Promise<{ transactionHash: string; returnValue: unknown }>
>();
const mockSimulateContract = jest.fn<
  (contractId: string, functionName: string, args: unknown[]) => Promise<{ returnValue: unknown }>
>();
const mockNativeToScVal = jest.fn<(val: unknown, opts?: unknown) => unknown>();
const mockScValToNative = jest.fn<(val: unknown) => unknown>();

jest.mock('../contract.service', () => ({
  __esModule: true,
  deployContract: (...args: unknown[]) =>
    mockDeployContract(...(args as [Buffer, string])),
  invokeContract: (...args: unknown[]) =>
    mockInvokeContract(...(args as [string, string, unknown[], string, unknown[]])),
  simulateContract: (...args: unknown[]) =>
    mockSimulateContract(...(args as [string, string, unknown[]])),
  nativeToScVal: (...args: unknown[]) =>
    mockNativeToScVal(...(args as [unknown, unknown])),
  scValToNative: (...args: unknown[]) =>
    mockScValToNative(...(args as [unknown])),
  xdr: {},
}));

// Mock encryption service
const mockDecrypt = jest.fn<(ciphertext: string, iv: string, authTag: string) => string>();

jest.mock('../encryption.service', () => ({
  __esModule: true,
  decrypt: (...args: unknown[]) => mockDecrypt(...(args as [string, string, string])),
}));

// Mock PIN service
const mockVerifyPin = jest.fn<(userId: string, pin: string) => Promise<boolean>>();

jest.mock('../pin.service', () => ({
  __esModule: true,
  verifyPin: (...args: unknown[]) => mockVerifyPin(...(args as [string, string])),
}));

// Mock fs.readFileSync for WASM binary reading
const mockReadFileSync = jest.fn<(path: string) => Buffer>();

jest.mock('fs', () => ({
  __esModule: true,
  default: {
    readFileSync: (...args: unknown[]) => mockReadFileSync(...(args as [string])),
  },
  readFileSync: (...args: unknown[]) => mockReadFileSync(...(args as [string])),
}));

// Mock @stellar/stellar-sdk Address class
const mockAddressFromString = jest.fn<(address: string) => unknown>();

jest.mock('@stellar/stellar-sdk', () => ({
  __esModule: true,
  Address: {
    fromString: (...args: unknown[]) => mockAddressFromString(...(args as [string])),
  },
}));

// Prisma is mocked globally via test/setup.ts

import { deposit, withdraw, swap } from '../pool.service';
import { prisma } from '@/lib/prisma';

// ─── Test constants ──────────────────────────────────────────────────────────

const TEST_MERCHANT_ID = 'merchant_pool_123';
const TEST_USER_ID = 'user_swap_456';
const TEST_STELLAR_ADDRESS = 'GBCM3GAOCAPT3YPZCIZ2JKXJQ7YUQFGQE5AQNXFM5LJDQH7ZZQKZVA';
const TEST_SECRET_KEY = 'SCZANGBA5YHTNYVVV3C7CAZMCLXPILHSE7KA52FYI7RCZPYDHO2SYZXGT';
const TEST_POOL_CONTRACT_ID = 'CPOOL0000000000000000000000000000000000000000000000000000';
const TEST_TOKEN_A_CONTRACT_ID = 'CTOKENA000000000000000000000000000000000000000000000000';
const TEST_TOKEN_B_CONTRACT_ID = 'CTOKENB000000000000000000000000000000000000000000000000';
const TEST_TX_HASH = 'pool-tx-hash-abc123';
const TEST_PIN = '1234';

const TEST_WALLET = {
  encryptedSecretKey: 'encrypted-secret',
  encryptionIV: 'iv-hex',
  authTag: 'auth-tag-hex',
  stellarAddress: TEST_STELLAR_ADDRESS,
};

// ─── Test helpers ────────────────────────────────────────────────────────────

/**
 * Sets up default mocks for a successful deposit/withdraw/swap flow:
 * PIN verification passes, wallet is found, decryption succeeds, and
 * contract invocations return expected values.
 */
function setupDefaultMocks() {
  // PIN verification succeeds
  mockVerifyPin.mockResolvedValue(true);

  // Wallet lookup returns a valid wallet
  (prisma.wallet.findUnique as jest.Mock).mockResolvedValue(TEST_WALLET);

  // Decrypt returns the test secret key
  mockDecrypt.mockReturnValue(TEST_SECRET_KEY);

  // nativeToScVal returns a mock ScVal
  mockNativeToScVal.mockReturnValue({ _type: 'mockScVal' });

  // Address.fromString returns a mock address object
  mockAddressFromString.mockReturnValue({ _address: TEST_STELLAR_ADDRESS });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PoolService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.POOL_WASM_PATH = '/mock/path/to/liquidity_pool.wasm';
  });

  afterEach(() => {
    delete process.env.POOL_WASM_PATH;
  });

  // ─── deposit ───────────────────────────────────────────────────────────

  describe('deposit()', () => {
    it('returns shares and transactionHash on successful deposit', async () => {
      setupDefaultMocks();

      // invokeContract returns shares as the return value
      mockInvokeContract.mockResolvedValue({
        transactionHash: TEST_TX_HASH,
        returnValue: { _type: 'i128ScVal' },
      });
      mockScValToNative.mockReturnValue(BigInt('5000'));

      // No existing LP position
      (prisma.lPPosition.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.lPPosition.create as jest.Mock).mockResolvedValue({});

      const result = await deposit({
        poolContractId: TEST_POOL_CONTRACT_ID,
        amountA: '1000',
        amountB: '2000',
        merchantId: TEST_MERCHANT_ID,
        pin: TEST_PIN,
        tokenAContractId: TEST_TOKEN_A_CONTRACT_ID,
        tokenBContractId: TEST_TOKEN_B_CONTRACT_ID,
      });

      expect(result).toEqual({
        shares: '5000',
        transactionHash: TEST_TX_HASH,
      });
    });

    it('verifies PIN before proceeding with deposit', async () => {
      setupDefaultMocks();
      mockInvokeContract.mockResolvedValue({
        transactionHash: TEST_TX_HASH,
        returnValue: { _type: 'i128ScVal' },
      });
      mockScValToNative.mockReturnValue(BigInt('5000'));
      (prisma.lPPosition.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.lPPosition.create as jest.Mock).mockResolvedValue({});

      await deposit({
        poolContractId: TEST_POOL_CONTRACT_ID,
        amountA: '1000',
        amountB: '2000',
        merchantId: TEST_MERCHANT_ID,
        pin: TEST_PIN,
      });

      expect(mockVerifyPin).toHaveBeenCalledWith(TEST_MERCHANT_ID, TEST_PIN);
    });

    it('decrypts the merchant secret key via EncryptionService', async () => {
      setupDefaultMocks();
      mockInvokeContract.mockResolvedValue({
        transactionHash: TEST_TX_HASH,
        returnValue: { _type: 'i128ScVal' },
      });
      mockScValToNative.mockReturnValue(BigInt('5000'));
      (prisma.lPPosition.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.lPPosition.create as jest.Mock).mockResolvedValue({});

      await deposit({
        poolContractId: TEST_POOL_CONTRACT_ID,
        amountA: '1000',
        amountB: '2000',
        merchantId: TEST_MERCHANT_ID,
        pin: TEST_PIN,
      });

      expect(mockDecrypt).toHaveBeenCalledWith(
        TEST_WALLET.encryptedSecretKey,
        TEST_WALLET.encryptionIV,
        TEST_WALLET.authTag,
      );
    });

    it('invokes pool contract deposit function with correct args', async () => {
      setupDefaultMocks();
      mockInvokeContract.mockResolvedValue({
        transactionHash: TEST_TX_HASH,
        returnValue: { _type: 'i128ScVal' },
      });
      mockScValToNative.mockReturnValue(BigInt('5000'));
      (prisma.lPPosition.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.lPPosition.create as jest.Mock).mockResolvedValue({});

      await deposit({
        poolContractId: TEST_POOL_CONTRACT_ID,
        amountA: '1000',
        amountB: '2000',
        merchantId: TEST_MERCHANT_ID,
        pin: TEST_PIN,
        tokenAContractId: TEST_TOKEN_A_CONTRACT_ID,
        tokenBContractId: TEST_TOKEN_B_CONTRACT_ID,
      });

      expect(mockInvokeContract).toHaveBeenCalledTimes(1);
      expect(mockInvokeContract.mock.calls[0][0]).toBe(TEST_POOL_CONTRACT_ID);
      expect(mockInvokeContract.mock.calls[0][1]).toBe('deposit');
      expect(mockInvokeContract.mock.calls[0][3]).toBe(TEST_SECRET_KEY);
    });

    it('creates a new LPPosition when none exists', async () => {
      setupDefaultMocks();
      mockInvokeContract.mockResolvedValue({
        transactionHash: TEST_TX_HASH,
        returnValue: { _type: 'i128ScVal' },
      });
      mockScValToNative.mockReturnValue(BigInt('5000'));
      (prisma.lPPosition.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.lPPosition.create as jest.Mock).mockResolvedValue({});

      await deposit({
        poolContractId: TEST_POOL_CONTRACT_ID,
        amountA: '1000',
        amountB: '2000',
        merchantId: TEST_MERCHANT_ID,
        pin: TEST_PIN,
        tokenAContractId: TEST_TOKEN_A_CONTRACT_ID,
        tokenBContractId: TEST_TOKEN_B_CONTRACT_ID,
      });

      expect(prisma.lPPosition.create).toHaveBeenCalledWith({
        data: {
          poolContractId: TEST_POOL_CONTRACT_ID,
          merchantId: TEST_MERCHANT_ID,
          shares: '5000',
          tokenAContractId: TEST_TOKEN_A_CONTRACT_ID,
          tokenBContractId: TEST_TOKEN_B_CONTRACT_ID,
        },
      });
    });

    it('updates existing LPPosition by adding new shares', async () => {
      setupDefaultMocks();
      mockInvokeContract.mockResolvedValue({
        transactionHash: TEST_TX_HASH,
        returnValue: { _type: 'i128ScVal' },
      });
      mockScValToNative.mockReturnValue(BigInt('3000'));

      // Existing position with 2000 shares
      (prisma.lPPosition.findUnique as jest.Mock).mockResolvedValue({
        poolContractId: TEST_POOL_CONTRACT_ID,
        merchantId: TEST_MERCHANT_ID,
        shares: { toString: () => '2000' },
      });
      (prisma.lPPosition.update as jest.Mock).mockResolvedValue({});

      await deposit({
        poolContractId: TEST_POOL_CONTRACT_ID,
        amountA: '1000',
        amountB: '2000',
        merchantId: TEST_MERCHANT_ID,
        pin: TEST_PIN,
        tokenAContractId: TEST_TOKEN_A_CONTRACT_ID,
        tokenBContractId: TEST_TOKEN_B_CONTRACT_ID,
      });

      expect(prisma.lPPosition.update).toHaveBeenCalledWith({
        where: {
          poolContractId_merchantId: {
            poolContractId: TEST_POOL_CONTRACT_ID,
            merchantId: TEST_MERCHANT_ID,
          },
        },
        data: {
          shares: '5000', // 2000 + 3000
          tokenAContractId: TEST_TOKEN_A_CONTRACT_ID,
          tokenBContractId: TEST_TOKEN_B_CONTRACT_ID,
        },
      });
    });

    it('throws when PIN verification fails', async () => {
      mockVerifyPin.mockResolvedValue(false);

      await expect(
        deposit({
          poolContractId: TEST_POOL_CONTRACT_ID,
          amountA: '1000',
          amountB: '2000',
          merchantId: TEST_MERCHANT_ID,
          pin: 'wrong',
        }),
      ).rejects.toThrow(/Invalid PIN/);
    });

    it('throws descriptive error when on-chain deposit fails', async () => {
      setupDefaultMocks();
      mockInvokeContract.mockRejectedValue(
        new Error('InvokeHostFunctionFailed: insufficient token balance'),
      );

      await expect(
        deposit({
          poolContractId: TEST_POOL_CONTRACT_ID,
          amountA: '1000',
          amountB: '2000',
          merchantId: TEST_MERCHANT_ID,
          pin: TEST_PIN,
        }),
      ).rejects.toThrow(/Pool deposit failed on-chain.*insufficient token balance/);
    });
  });

  // ─── withdraw ──────────────────────────────────────────────────────────

  describe('withdraw()', () => {
    it('returns amountA, amountB, and transactionHash on successful withdrawal', async () => {
      setupDefaultMocks();
      mockInvokeContract.mockResolvedValue({
        transactionHash: TEST_TX_HASH,
        returnValue: { _type: 'tupleScVal' },
      });
      // Return value is an array [amountA, amountB]
      mockScValToNative.mockReturnValue([BigInt('500'), BigInt('1000')]);

      // Existing position with enough shares
      (prisma.lPPosition.findUnique as jest.Mock).mockResolvedValue({
        poolContractId: TEST_POOL_CONTRACT_ID,
        merchantId: TEST_MERCHANT_ID,
        shares: { toString: () => '5000' },
      });
      (prisma.lPPosition.update as jest.Mock).mockResolvedValue({});

      const result = await withdraw({
        poolContractId: TEST_POOL_CONTRACT_ID,
        shares: '2000',
        merchantId: TEST_MERCHANT_ID,
        pin: TEST_PIN,
      });

      expect(result).toEqual({
        amountA: '500',
        amountB: '1000',
        transactionHash: TEST_TX_HASH,
      });
    });

    it('verifies PIN before proceeding with withdrawal', async () => {
      setupDefaultMocks();
      mockInvokeContract.mockResolvedValue({
        transactionHash: TEST_TX_HASH,
        returnValue: { _type: 'tupleScVal' },
      });
      mockScValToNative.mockReturnValue([BigInt('500'), BigInt('1000')]);
      (prisma.lPPosition.findUnique as jest.Mock).mockResolvedValue({
        shares: { toString: () => '5000' },
      });
      (prisma.lPPosition.update as jest.Mock).mockResolvedValue({});

      await withdraw({
        poolContractId: TEST_POOL_CONTRACT_ID,
        shares: '2000',
        merchantId: TEST_MERCHANT_ID,
        pin: TEST_PIN,
      });

      expect(mockVerifyPin).toHaveBeenCalledWith(TEST_MERCHANT_ID, TEST_PIN);
    });

    it('invokes pool contract withdraw function', async () => {
      setupDefaultMocks();
      mockInvokeContract.mockResolvedValue({
        transactionHash: TEST_TX_HASH,
        returnValue: { _type: 'tupleScVal' },
      });
      mockScValToNative.mockReturnValue([BigInt('500'), BigInt('1000')]);
      (prisma.lPPosition.findUnique as jest.Mock).mockResolvedValue({
        shares: { toString: () => '5000' },
      });
      (prisma.lPPosition.update as jest.Mock).mockResolvedValue({});

      await withdraw({
        poolContractId: TEST_POOL_CONTRACT_ID,
        shares: '2000',
        merchantId: TEST_MERCHANT_ID,
        pin: TEST_PIN,
      });

      expect(mockInvokeContract).toHaveBeenCalledTimes(1);
      expect(mockInvokeContract.mock.calls[0][0]).toBe(TEST_POOL_CONTRACT_ID);
      expect(mockInvokeContract.mock.calls[0][1]).toBe('withdraw');
      expect(mockInvokeContract.mock.calls[0][3]).toBe(TEST_SECRET_KEY);
    });

    it('reduces shares in existing LPPosition after partial withdrawal', async () => {
      setupDefaultMocks();
      mockInvokeContract.mockResolvedValue({
        transactionHash: TEST_TX_HASH,
        returnValue: { _type: 'tupleScVal' },
      });
      mockScValToNative.mockReturnValue([BigInt('500'), BigInt('1000')]);

      (prisma.lPPosition.findUnique as jest.Mock).mockResolvedValue({
        poolContractId: TEST_POOL_CONTRACT_ID,
        merchantId: TEST_MERCHANT_ID,
        shares: { toString: () => '5000' },
      });
      (prisma.lPPosition.update as jest.Mock).mockResolvedValue({});

      await withdraw({
        poolContractId: TEST_POOL_CONTRACT_ID,
        shares: '2000',
        merchantId: TEST_MERCHANT_ID,
        pin: TEST_PIN,
      });

      expect(prisma.lPPosition.update).toHaveBeenCalledWith({
        where: {
          poolContractId_merchantId: {
            poolContractId: TEST_POOL_CONTRACT_ID,
            merchantId: TEST_MERCHANT_ID,
          },
        },
        data: {
          shares: '3000', // 5000 - 2000
        },
      });
    });

    it('deletes LPPosition when all shares are withdrawn', async () => {
      setupDefaultMocks();
      mockInvokeContract.mockResolvedValue({
        transactionHash: TEST_TX_HASH,
        returnValue: { _type: 'tupleScVal' },
      });
      mockScValToNative.mockReturnValue([BigInt('1000'), BigInt('2000')]);

      (prisma.lPPosition.findUnique as jest.Mock).mockResolvedValue({
        poolContractId: TEST_POOL_CONTRACT_ID,
        merchantId: TEST_MERCHANT_ID,
        shares: { toString: () => '5000' },
      });
      (prisma.lPPosition.delete as jest.Mock).mockResolvedValue({});

      await withdraw({
        poolContractId: TEST_POOL_CONTRACT_ID,
        shares: '5000',
        merchantId: TEST_MERCHANT_ID,
        pin: TEST_PIN,
      });

      expect(prisma.lPPosition.delete).toHaveBeenCalledWith({
        where: {
          poolContractId_merchantId: {
            poolContractId: TEST_POOL_CONTRACT_ID,
            merchantId: TEST_MERCHANT_ID,
          },
        },
      });
    });

    it('throws descriptive error when on-chain withdrawal fails', async () => {
      setupDefaultMocks();
      mockInvokeContract.mockRejectedValue(
        new Error('InvokeHostFunctionFailed: insufficient shares'),
      );

      await expect(
        withdraw({
          poolContractId: TEST_POOL_CONTRACT_ID,
          shares: '99999',
          merchantId: TEST_MERCHANT_ID,
          pin: TEST_PIN,
        }),
      ).rejects.toThrow(/Pool withdrawal failed on-chain.*insufficient shares/);
    });
  });

  // ─── swap ──────────────────────────────────────────────────────────────

  describe('swap()', () => {
    it('returns outputAmount, effectiveRate, feeAmount, and transactionHash on success', async () => {
      setupDefaultMocks();

      // Simulate returns output amount above minimum
      mockSimulateContract.mockResolvedValue({
        returnValue: { _type: 'i128ScVal' },
      });
      // First scValToNative call: simulated output
      // Second scValToNative call: actual output from invoke
      mockScValToNative
        .mockReturnValueOnce(BigInt('950'))   // simulated output
        .mockReturnValueOnce(BigInt('950'));   // actual output

      mockInvokeContract.mockResolvedValue({
        transactionHash: TEST_TX_HASH,
        returnValue: { _type: 'i128ScVal' },
      });

      // LP position lookup for output token determination
      (prisma.lPPosition.findFirst as jest.Mock).mockResolvedValue({
        tokenAContractId: TEST_TOKEN_A_CONTRACT_ID,
        tokenBContractId: TEST_TOKEN_B_CONTRACT_ID,
      });
      (prisma.swapTransaction.create as jest.Mock).mockResolvedValue({});

      const result = await swap({
        poolContractId: TEST_POOL_CONTRACT_ID,
        inputToken: TEST_TOKEN_A_CONTRACT_ID,
        inputAmount: '1000',
        minOutputAmount: '900',
        userId: TEST_USER_ID,
        pin: TEST_PIN,
      });

      expect(result.outputAmount).toBe('950');
      expect(result.transactionHash).toBe(TEST_TX_HASH);
      expect(result.feeAmount).toBe('3'); // 1000 * 0.003 = 3
      expect(result.effectiveRate).toBe('0.95'); // 950 / 1000
    });

    it('verifies PIN before proceeding with swap', async () => {
      setupDefaultMocks();
      mockSimulateContract.mockResolvedValue({ returnValue: { _type: 'i128' } });
      mockScValToNative
        .mockReturnValueOnce(BigInt('950'))
        .mockReturnValueOnce(BigInt('950'));
      mockInvokeContract.mockResolvedValue({
        transactionHash: TEST_TX_HASH,
        returnValue: { _type: 'i128' },
      });
      (prisma.lPPosition.findFirst as jest.Mock).mockResolvedValue({
        tokenAContractId: TEST_TOKEN_A_CONTRACT_ID,
        tokenBContractId: TEST_TOKEN_B_CONTRACT_ID,
      });
      (prisma.swapTransaction.create as jest.Mock).mockResolvedValue({});

      await swap({
        poolContractId: TEST_POOL_CONTRACT_ID,
        inputToken: TEST_TOKEN_A_CONTRACT_ID,
        inputAmount: '1000',
        minOutputAmount: '900',
        userId: TEST_USER_ID,
        pin: TEST_PIN,
      });

      expect(mockVerifyPin).toHaveBeenCalledWith(TEST_USER_ID, TEST_PIN);
    });

    it('simulates swap before submitting transaction', async () => {
      setupDefaultMocks();
      mockSimulateContract.mockResolvedValue({ returnValue: { _type: 'i128' } });
      mockScValToNative
        .mockReturnValueOnce(BigInt('950'))
        .mockReturnValueOnce(BigInt('950'));
      mockInvokeContract.mockResolvedValue({
        transactionHash: TEST_TX_HASH,
        returnValue: { _type: 'i128' },
      });
      (prisma.lPPosition.findFirst as jest.Mock).mockResolvedValue({
        tokenAContractId: TEST_TOKEN_A_CONTRACT_ID,
        tokenBContractId: TEST_TOKEN_B_CONTRACT_ID,
      });
      (prisma.swapTransaction.create as jest.Mock).mockResolvedValue({});

      await swap({
        poolContractId: TEST_POOL_CONTRACT_ID,
        inputToken: TEST_TOKEN_A_CONTRACT_ID,
        inputAmount: '1000',
        minOutputAmount: '900',
        userId: TEST_USER_ID,
        pin: TEST_PIN,
      });

      // simulateContract should be called before invokeContract
      expect(mockSimulateContract).toHaveBeenCalledTimes(1);
      expect(mockSimulateContract.mock.calls[0][0]).toBe(TEST_POOL_CONTRACT_ID);
      expect(mockSimulateContract.mock.calls[0][1]).toBe('swap');
    });

    it('rejects swap when simulated output < minOutputAmount (slippage protection)', async () => {
      setupDefaultMocks();
      mockSimulateContract.mockResolvedValue({ returnValue: { _type: 'i128' } });
      // Simulated output is below the minimum
      mockScValToNative.mockReturnValue(BigInt('800'));

      await expect(
        swap({
          poolContractId: TEST_POOL_CONTRACT_ID,
          inputToken: TEST_TOKEN_A_CONTRACT_ID,
          inputAmount: '1000',
          minOutputAmount: '900',
          userId: TEST_USER_ID,
          pin: TEST_PIN,
        }),
      ).rejects.toThrow(/Slippage protection.*800.*below minimum.*900/);

      // invokeContract should NOT have been called
      expect(mockInvokeContract).not.toHaveBeenCalled();
    });

    it('records SwapTransaction in database after successful swap', async () => {
      setupDefaultMocks();
      mockSimulateContract.mockResolvedValue({ returnValue: { _type: 'i128' } });
      mockScValToNative
        .mockReturnValueOnce(BigInt('950'))
        .mockReturnValueOnce(BigInt('950'));
      mockInvokeContract.mockResolvedValue({
        transactionHash: TEST_TX_HASH,
        returnValue: { _type: 'i128' },
      });
      (prisma.lPPosition.findFirst as jest.Mock).mockResolvedValue({
        tokenAContractId: TEST_TOKEN_A_CONTRACT_ID,
        tokenBContractId: TEST_TOKEN_B_CONTRACT_ID,
      });
      (prisma.swapTransaction.create as jest.Mock).mockResolvedValue({});

      await swap({
        poolContractId: TEST_POOL_CONTRACT_ID,
        inputToken: TEST_TOKEN_A_CONTRACT_ID,
        inputAmount: '1000',
        minOutputAmount: '900',
        userId: TEST_USER_ID,
        pin: TEST_PIN,
      });

      expect(prisma.swapTransaction.create).toHaveBeenCalledWith({
        data: {
          poolContractId: TEST_POOL_CONTRACT_ID,
          userId: TEST_USER_ID,
          inputToken: TEST_TOKEN_A_CONTRACT_ID,
          outputToken: TEST_TOKEN_B_CONTRACT_ID,
          inputAmount: '1000',
          outputAmount: '950',
          feeAmount: '3',
          stellarTxHash: TEST_TX_HASH,
        },
      });
    });

    it('throws descriptive error when on-chain swap fails', async () => {
      setupDefaultMocks();
      mockSimulateContract.mockResolvedValue({ returnValue: { _type: 'i128' } });
      mockScValToNative.mockReturnValueOnce(BigInt('950'));
      mockInvokeContract.mockRejectedValue(
        new Error('InvokeHostFunctionFailed: pool reserves depleted'),
      );

      await expect(
        swap({
          poolContractId: TEST_POOL_CONTRACT_ID,
          inputToken: TEST_TOKEN_A_CONTRACT_ID,
          inputAmount: '1000',
          minOutputAmount: '900',
          userId: TEST_USER_ID,
          pin: TEST_PIN,
        }),
      ).rejects.toThrow(/Swap transaction failed on-chain.*pool reserves depleted/);
    });

    it('throws when swap simulation fails', async () => {
      setupDefaultMocks();
      mockSimulateContract.mockRejectedValue(
        new Error('Contract not found on testnet'),
      );

      await expect(
        swap({
          poolContractId: TEST_POOL_CONTRACT_ID,
          inputToken: TEST_TOKEN_A_CONTRACT_ID,
          inputAmount: '1000',
          minOutputAmount: '900',
          userId: TEST_USER_ID,
          pin: TEST_PIN,
        }),
      ).rejects.toThrow(/Swap simulation failed.*Contract not found/);
    });
  });
});
