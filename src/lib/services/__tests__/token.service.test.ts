/**
 * Unit tests for TokenService.
 *
 * Mocks ContractService, EncryptionService, Prisma, fs, and @stellar/stellar-sdk
 * to test SEP-41 token creation, balance queries, and decimal validation
 * without hitting the real Soroban testnet or database.
 *
 * @see Requirements 7.1, 7.2, 7.4, 7.5
 */

import { jest } from '@jest/globals';

// ─── Mock setup ──────────────────────────────────────────────────────────────

// Mock contract service functions
const mockDeployContract = jest.fn<
  (wasmBuffer: Buffer, deployerSecret: string) => Promise<{ contractId: string; transactionHash: string }>
>();
const mockInvokeContract = jest.fn<
  (contractId: string, functionName: string, args: unknown[], callerSecret: string) => Promise<{ transactionHash: string; returnValue: unknown }>
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
    mockInvokeContract(...(args as [string, string, unknown[], string])),
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

import { createToken, getTokenBalance, getUserTokenBalances } from '../token.service';
import { prisma } from '@/lib/prisma';

// ─── Test constants ──────────────────────────────────────────────────────────

const TEST_MERCHANT_ID = 'merchant_test_123';
const TEST_MERCHANT_ADDRESS = 'GBCM3GAOCAPT3YPZCIZ2JKXJQ7YUQFGQE5AQNXFM5LJDQH7ZZQKZVA';
const TEST_SECRET_KEY = 'SCZANGBA5YHTNYVVV3C7CAZMCLXPILHSE7KA52FYI7RCZPYDHO2SYZXGT';
const TEST_CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHK3M';
const TEST_TX_HASH = 'deploy-tx-hash-123';
const TEST_WASM_BINARY = Buffer.from('mock-wasm-binary');

const TEST_WALLET = {
  encryptedSecretKey: 'encrypted-secret',
  encryptionIV: 'iv-hex',
  authTag: 'auth-tag-hex',
  stellarAddress: TEST_MERCHANT_ADDRESS,
};

// ─── Test helpers ────────────────────────────────────────────────────────────

function setupDefaultMocks() {
  // Wallet lookup returns a valid wallet (two calls: decryptMerchantSecret + getMerchantAddress)
  (prisma.wallet.findUnique as jest.Mock)
    .mockResolvedValueOnce(TEST_WALLET)   // decryptMerchantSecret
    .mockResolvedValueOnce(TEST_WALLET);  // getMerchantAddress

  // Decrypt returns the test secret key
  mockDecrypt.mockReturnValue(TEST_SECRET_KEY);

  // fs.readFileSync returns mock WASM binary
  mockReadFileSync.mockReturnValue(TEST_WASM_BINARY);

  // deployContract returns contract ID and tx hash
  mockDeployContract.mockResolvedValue({
    contractId: TEST_CONTRACT_ID,
    transactionHash: TEST_TX_HASH,
  });

  // invokeContract succeeds for initialize and mint
  mockInvokeContract.mockResolvedValue({
    transactionHash: 'invoke-tx-hash',
    returnValue: null,
  });

  // nativeToScVal returns a mock ScVal
  mockNativeToScVal.mockReturnValue({ _type: 'mockScVal' });

  // Address.fromString returns a mock address object
  mockAddressFromString.mockReturnValue({ _address: TEST_MERCHANT_ADDRESS });

  // prisma.token.create succeeds
  (prisma.token.create as jest.Mock).mockResolvedValue({
    id: 'token_1',
    contractId: TEST_CONTRACT_ID,
    name: 'TestToken',
    symbol: 'TT',
    decimals: 7,
    deployerId: TEST_MERCHANT_ID,
    createdAt: new Date(),
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TokenService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TOKEN_WASM_PATH = '/mock/path/to/sep41_token.wasm';
  });

  afterEach(() => {
    delete process.env.TOKEN_WASM_PATH;
  });

  // ─── createToken ─────────────────────────────────────────────────────────

  describe('createToken()', () => {
    it('returns contractId and transactionHash on successful creation', async () => {
      setupDefaultMocks();

      const result = await createToken({
        name: 'TestToken',
        symbol: 'TT',
        decimals: 7,
        initialSupply: '1000000',
        merchantId: TEST_MERCHANT_ID,
      });

      expect(result).toEqual({
        contractId: TEST_CONTRACT_ID,
        transactionHash: TEST_TX_HASH,
      });
    });

    it('deploys the WASM binary via ContractService.deployContract', async () => {
      setupDefaultMocks();

      await createToken({
        name: 'TestToken',
        symbol: 'TT',
        decimals: 7,
        initialSupply: '1000000',
        merchantId: TEST_MERCHANT_ID,
      });

      expect(mockDeployContract).toHaveBeenCalledWith(
        Buffer.from(TEST_WASM_BINARY),
        TEST_SECRET_KEY,
      );
    });

    it('invokes initialize then mint on the deployed contract', async () => {
      setupDefaultMocks();

      await createToken({
        name: 'TestToken',
        symbol: 'TT',
        decimals: 7,
        initialSupply: '1000000',
        merchantId: TEST_MERCHANT_ID,
      });

      // First call: initialize(admin, decimals, name, symbol)
      expect(mockInvokeContract).toHaveBeenCalledTimes(2);
      expect(mockInvokeContract.mock.calls[0][0]).toBe(TEST_CONTRACT_ID);
      expect(mockInvokeContract.mock.calls[0][1]).toBe('initialize');
      expect(mockInvokeContract.mock.calls[0][3]).toBe(TEST_SECRET_KEY);

      // Second call: mint(to, amount)
      expect(mockInvokeContract.mock.calls[1][0]).toBe(TEST_CONTRACT_ID);
      expect(mockInvokeContract.mock.calls[1][1]).toBe('mint');
      expect(mockInvokeContract.mock.calls[1][3]).toBe(TEST_SECRET_KEY);
    });

    it('stores token metadata in the database via Prisma', async () => {
      setupDefaultMocks();

      await createToken({
        name: 'TestToken',
        symbol: 'TT',
        decimals: 7,
        initialSupply: '1000000',
        merchantId: TEST_MERCHANT_ID,
      });

      expect(prisma.token.create).toHaveBeenCalledWith({
        data: {
          contractId: TEST_CONTRACT_ID,
          name: 'TestToken',
          symbol: 'TT',
          decimals: 7,
          deployerId: TEST_MERCHANT_ID,
        },
      });
    });

    it('decrypts the merchant secret key via EncryptionService', async () => {
      setupDefaultMocks();

      await createToken({
        name: 'TestToken',
        symbol: 'TT',
        decimals: 7,
        initialSupply: '1000000',
        merchantId: TEST_MERCHANT_ID,
      });

      expect(mockDecrypt).toHaveBeenCalledWith(
        TEST_WALLET.encryptedSecretKey,
        TEST_WALLET.encryptionIV,
        TEST_WALLET.authTag,
      );
    });

    it('reads the WASM binary from the configured path', async () => {
      setupDefaultMocks();

      await createToken({
        name: 'TestToken',
        symbol: 'TT',
        decimals: 7,
        initialSupply: '1000000',
        merchantId: TEST_MERCHANT_ID,
      });

      expect(mockReadFileSync).toHaveBeenCalledWith('/mock/path/to/sep41_token.wasm');
    });

    it('throws when merchant has no wallet', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        createToken({
          name: 'TestToken',
          symbol: 'TT',
          decimals: 7,
          initialSupply: '1000000',
          merchantId: TEST_MERCHANT_ID,
        }),
      ).rejects.toThrow(/No wallet found for merchant/);
    });

    // ─── Decimal validation ──────────────────────────────────────────────

    it('throws when decimals is negative', async () => {
      await expect(
        createToken({
          name: 'TestToken',
          symbol: 'TT',
          decimals: -1,
          initialSupply: '1000000',
          merchantId: TEST_MERCHANT_ID,
        }),
      ).rejects.toThrow(/Invalid decimals: -1/);
    });

    it('throws when decimals exceeds 18', async () => {
      await expect(
        createToken({
          name: 'TestToken',
          symbol: 'TT',
          decimals: 19,
          initialSupply: '1000000',
          merchantId: TEST_MERCHANT_ID,
        }),
      ).rejects.toThrow(/Invalid decimals: 19/);
    });

    it('throws when decimals is not an integer', async () => {
      await expect(
        createToken({
          name: 'TestToken',
          symbol: 'TT',
          decimals: 7.5,
          initialSupply: '1000000',
          merchantId: TEST_MERCHANT_ID,
        }),
      ).rejects.toThrow(/Invalid decimals: 7.5/);
    });

    it('accepts decimals at boundary value 0', async () => {
      setupDefaultMocks();

      const result = await createToken({
        name: 'TestToken',
        symbol: 'TT',
        decimals: 0,
        initialSupply: '1000000',
        merchantId: TEST_MERCHANT_ID,
      });

      expect(result.contractId).toBe(TEST_CONTRACT_ID);
    });

    it('accepts decimals at boundary value 18', async () => {
      setupDefaultMocks();

      const result = await createToken({
        name: 'TestToken',
        symbol: 'TT',
        decimals: 18,
        initialSupply: '1000000',
        merchantId: TEST_MERCHANT_ID,
      });

      expect(result.contractId).toBe(TEST_CONTRACT_ID);
    });
  });

  // ─── getTokenBalance ─────────────────────────────────────────────────────

  describe('getTokenBalance()', () => {
    it('returns the balance as a string from simulation result', async () => {
      const mockReturnValue = { _type: 'i128ScVal' };
      mockSimulateContract.mockResolvedValue({ returnValue: mockReturnValue });
      mockScValToNative.mockReturnValue(BigInt('5000000'));
      mockNativeToScVal.mockReturnValue({ _type: 'addressScVal' });
      mockAddressFromString.mockReturnValue({ _address: TEST_MERCHANT_ADDRESS });

      const balance = await getTokenBalance(TEST_CONTRACT_ID, TEST_MERCHANT_ADDRESS);

      expect(balance).toBe('5000000');
    });

    it('calls simulateContract with balance function and address arg', async () => {
      const mockReturnValue = { _type: 'i128ScVal' };
      mockSimulateContract.mockResolvedValue({ returnValue: mockReturnValue });
      mockScValToNative.mockReturnValue(BigInt('100'));
      mockNativeToScVal.mockReturnValue({ _type: 'addressScVal' });
      mockAddressFromString.mockReturnValue({ _address: TEST_MERCHANT_ADDRESS });

      await getTokenBalance(TEST_CONTRACT_ID, TEST_MERCHANT_ADDRESS);

      expect(mockSimulateContract).toHaveBeenCalledWith(
        TEST_CONTRACT_ID,
        'balance',
        [{ _type: 'addressScVal' }],
      );
    });

    it('converts the simulation return value via scValToNative', async () => {
      const mockReturnValue = { _type: 'i128ScVal' };
      mockSimulateContract.mockResolvedValue({ returnValue: mockReturnValue });
      mockScValToNative.mockReturnValue(42);
      mockNativeToScVal.mockReturnValue({ _type: 'addressScVal' });
      mockAddressFromString.mockReturnValue({ _address: TEST_MERCHANT_ADDRESS });

      const balance = await getTokenBalance(TEST_CONTRACT_ID, TEST_MERCHANT_ADDRESS);

      expect(mockScValToNative).toHaveBeenCalledWith(mockReturnValue);
      expect(balance).toBe('42');
    });
  });

  // ─── getUserTokenBalances ────────────────────────────────────────────────

  describe('getUserTokenBalances()', () => {
    const TEST_USER_ID = 'user_test_456';

    it('returns empty array when user has no wallet', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await getUserTokenBalances(TEST_USER_ID);

      expect(result).toEqual([]);
    });

    it('returns empty array when user has no tokens', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({
        stellarAddress: TEST_MERCHANT_ADDRESS,
      });
      (prisma.token.findMany as jest.Mock).mockResolvedValue([]);

      const result = await getUserTokenBalances(TEST_USER_ID);

      expect(result).toEqual([]);
    });

    it('returns token balances for user with tokens', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({
        stellarAddress: TEST_MERCHANT_ADDRESS,
      });
      (prisma.token.findMany as jest.Mock).mockResolvedValue([
        {
          contractId: 'CONTRACT_A',
          name: 'TokenA',
          symbol: 'TA',
          decimals: 7,
        },
        {
          contractId: 'CONTRACT_B',
          name: 'TokenB',
          symbol: 'TB',
          decimals: 18,
        },
      ]);

      // Mock simulateContract for each token balance query
      mockSimulateContract
        .mockResolvedValueOnce({ returnValue: { _type: 'i128' } })
        .mockResolvedValueOnce({ returnValue: { _type: 'i128' } });

      mockScValToNative
        .mockReturnValueOnce(BigInt('1000'))
        .mockReturnValueOnce(BigInt('2000'));

      mockNativeToScVal.mockReturnValue({ _type: 'addressScVal' });
      mockAddressFromString.mockReturnValue({ _address: TEST_MERCHANT_ADDRESS });

      const result = await getUserTokenBalances(TEST_USER_ID);

      expect(result).toEqual([
        {
          contractId: 'CONTRACT_A',
          name: 'TokenA',
          symbol: 'TA',
          decimals: 7,
          balance: '1000',
        },
        {
          contractId: 'CONTRACT_B',
          name: 'TokenB',
          symbol: 'TB',
          decimals: 18,
          balance: '2000',
        },
      ]);
    });

    it('returns "0" balance when individual balance query fails', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({
        stellarAddress: TEST_MERCHANT_ADDRESS,
      });
      (prisma.token.findMany as jest.Mock).mockResolvedValue([
        {
          contractId: 'CONTRACT_A',
          name: 'TokenA',
          symbol: 'TA',
          decimals: 7,
        },
        {
          contractId: 'CONTRACT_BROKEN',
          name: 'BrokenToken',
          symbol: 'BT',
          decimals: 8,
        },
      ]);

      // First token succeeds, second fails
      mockSimulateContract
        .mockResolvedValueOnce({ returnValue: { _type: 'i128' } })
        .mockRejectedValueOnce(new Error('Contract not found'));

      mockScValToNative.mockReturnValueOnce(BigInt('500'));
      mockNativeToScVal.mockReturnValue({ _type: 'addressScVal' });
      mockAddressFromString.mockReturnValue({ _address: TEST_MERCHANT_ADDRESS });

      const result = await getUserTokenBalances(TEST_USER_ID);

      expect(result).toEqual([
        {
          contractId: 'CONTRACT_A',
          name: 'TokenA',
          symbol: 'TA',
          decimals: 7,
          balance: '500',
        },
        {
          contractId: 'CONTRACT_BROKEN',
          name: 'BrokenToken',
          symbol: 'BT',
          decimals: 8,
          balance: '0',
        },
      ]);
    });

    it('queries tokens by deployerId matching the userId', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({
        stellarAddress: TEST_MERCHANT_ADDRESS,
      });
      (prisma.token.findMany as jest.Mock).mockResolvedValue([]);

      await getUserTokenBalances(TEST_USER_ID);

      expect(prisma.token.findMany).toHaveBeenCalledWith({
        where: { deployerId: TEST_USER_ID },
        select: {
          contractId: true,
          name: true,
          symbol: true,
          decimals: true,
        },
      });
    });
  });
});
