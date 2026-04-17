/**
 * Unit tests for StellarService.
 *
 * Mocks the @stellar/stellar-sdk to test all Stellar interactions
 * without hitting the real Horizon testnet.
 *
 * @see Requirements 2.1, 2.2, 2.5, 2.6, 3.5, 3.6, 5.2
 */

import { jest } from '@jest/globals';

// ─── Mock setup ──────────────────────────────────────────────────────────────
// jest.mock hoists to the top of the file automatically so mocks are in place
// before the module under test is imported.

const mockFriendbotCall = jest.fn();
const mockLoadAccount = jest.fn();
const mockSubmitTransaction = jest.fn();
const mockForAccount = jest.fn();
const mockCursor = jest.fn();
const mockStream = jest.fn();
const mockSign = jest.fn();
const mockAddOperation = jest.fn();
const mockAddMemo = jest.fn();
const mockSetTimeout = jest.fn();
const mockBuild = jest.fn();

jest.mock('@stellar/stellar-sdk', () => {
  const mockKeypairInstance = {
    publicKey: jest.fn(() => 'GBCM3GAOCAPT3YPZCIZ2JKXJQ7YUQFGQE5AQNXFM5LJDQH7ZZQKZVA'),
    secret: jest.fn(() => 'SCZANGBA5YHTNYVVV3C7CAZMCLXPILHSE7KA52FYI7RCZPYDHO2SYZXGT'),
  };

  // Build a chainable builder mock
  const builderInstance = {
    addOperation: mockAddOperation,
    addMemo: mockAddMemo,
    setTimeout: mockSetTimeout,
    build: mockBuild,
  };
  // Each chainable method returns the builder
  mockAddOperation.mockReturnValue(builderInstance);
  mockAddMemo.mockReturnValue(builderInstance);
  mockSetTimeout.mockReturnValue(builderInstance);
  mockBuild.mockReturnValue({ sign: mockSign });

  return {
    __esModule: true,
    Keypair: {
      random: jest.fn(() => mockKeypairInstance),
      fromSecret: jest.fn(() => mockKeypairInstance),
    },
    Horizon: {
      Server: jest.fn().mockImplementation(() => ({
        friendbot: jest.fn(() => ({ call: mockFriendbotCall })),
        loadAccount: mockLoadAccount,
        submitTransaction: mockSubmitTransaction,
        payments: jest.fn(() => ({
          forAccount: mockForAccount.mockReturnValue({
            cursor: mockCursor.mockReturnValue({
              stream: mockStream,
            }),
          }),
        })),
      })),
    },
    TransactionBuilder: jest.fn().mockImplementation(() => builderInstance),
    Networks: {
      TESTNET: 'Test SDF Network ; September 2015',
    },
    Operation: {
      payment: jest.fn(() => 'mock-payment-operation'),
    },
    Asset: {
      native: jest.fn(() => 'native-asset'),
    },
    Memo: {
      text: jest.fn((text: string) => `memo:${text}`),
    },
    BASE_FEE: '100',
  };
});

// Import the module under test — mocks are already in place
import {
  generateKeypair,
  fundAccount,
  getBalance,
  submitPayment,
  streamPayments,
} from '../stellar.service';

// Import the mocked SDK so we can inspect calls
import {
  Keypair,
  Operation,
  Memo,
} from '@stellar/stellar-sdk';

// ─── Environment setup ──────────────────────────────────────────────────────

beforeAll(() => {
  process.env.HORIZON_URL = 'https://horizon-testnet.stellar.org';
  process.env.STELLAR_NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
});

afterAll(() => {
  delete process.env.HORIZON_URL;
  delete process.env.STELLAR_NETWORK_PASSPHRASE;
});

beforeEach(() => {
  jest.clearAllMocks();
  // Restore chainable mocks after clearAllMocks
  const builderInstance = {
    addOperation: mockAddOperation,
    addMemo: mockAddMemo,
    setTimeout: mockSetTimeout,
    build: mockBuild,
  };
  mockAddOperation.mockReturnValue(builderInstance);
  mockAddMemo.mockReturnValue(builderInstance);
  mockSetTimeout.mockReturnValue(builderInstance);
  mockBuild.mockReturnValue({ sign: mockSign });
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('StellarService', () => {
  describe('generateKeypair()', () => {
    it('returns an object with publicKey and secretKey', () => {
      const result = generateKeypair();

      expect(result).toHaveProperty('publicKey');
      expect(result).toHaveProperty('secretKey');
      expect(typeof result.publicKey).toBe('string');
      expect(typeof result.secretKey).toBe('string');
    });

    it('calls Keypair.random() from the Stellar SDK', () => {
      generateKeypair();
      expect(Keypair.random).toHaveBeenCalledTimes(1);
    });

    it('returns the public key from the generated keypair', () => {
      const result = generateKeypair();
      expect(result.publicKey).toBe('GBCM3GAOCAPT3YPZCIZ2JKXJQ7YUQFGQE5AQNXFM5LJDQH7ZZQKZVA');
    });

    it('returns the secret key from the generated keypair', () => {
      const result = generateKeypair();
      expect(result.secretKey).toBe('SCZANGBA5YHTNYVVV3C7CAZMCLXPILHSE7KA52FYI7RCZPYDHO2SYZXGT');
    });
  });

  describe('fundAccount()', () => {
    it('calls Friendbot with the provided public key', async () => {
      mockFriendbotCall.mockResolvedValueOnce({});

      await fundAccount('GBCM3GAOCAPT3YPZCIZ2JKXJQ7YUQFGQE5AQNXFM5LJDQH7ZZQKZVA');

      expect(mockFriendbotCall).toHaveBeenCalledTimes(1);
    });

    it('succeeds on first attempt without retrying', async () => {
      mockFriendbotCall.mockResolvedValueOnce({});

      await expect(
        fundAccount('GBCM3GAOCAPT3YPZCIZ2JKXJQ7YUQFGQE5AQNXFM5LJDQH7ZZQKZVA')
      ).resolves.toBeUndefined();

      expect(mockFriendbotCall).toHaveBeenCalledTimes(1);
    });

    it('retries on failure and succeeds on second attempt', async () => {
      mockFriendbotCall
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({});

      await expect(
        fundAccount('GBCM3GAOCAPT3YPZCIZ2JKXJQ7YUQFGQE5AQNXFM5LJDQH7ZZQKZVA')
      ).resolves.toBeUndefined();

      expect(mockFriendbotCall).toHaveBeenCalledTimes(2);
    });

    it('retries up to 3 times and throws after all attempts fail', async () => {
      mockFriendbotCall
        .mockRejectedValueOnce(new Error('Attempt 1 fail'))
        .mockRejectedValueOnce(new Error('Attempt 2 fail'))
        .mockRejectedValueOnce(new Error('Attempt 3 fail'));

      await expect(
        fundAccount('GBCM3GAOCAPT3YPZCIZ2JKXJQ7YUQFGQE5AQNXFM5LJDQH7ZZQKZVA')
      ).rejects.toThrow(/Failed to fund account.*after 3 attempts/);

      expect(mockFriendbotCall).toHaveBeenCalledTimes(3);
    });

    it('includes the original error message in the thrown error', async () => {
      mockFriendbotCall
        .mockRejectedValueOnce(new Error('timeout'))
        .mockRejectedValueOnce(new Error('timeout'))
        .mockRejectedValueOnce(new Error('timeout'));

      await expect(
        fundAccount('GBCM3GAOCAPT3YPZCIZ2JKXJQ7YUQFGQE5AQNXFM5LJDQH7ZZQKZVA')
      ).rejects.toThrow('timeout');
    });

    it('succeeds on third attempt after two failures', async () => {
      mockFriendbotCall
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValueOnce({});

      await expect(
        fundAccount('GBCM3GAOCAPT3YPZCIZ2JKXJQ7YUQFGQE5AQNXFM5LJDQH7ZZQKZVA')
      ).resolves.toBeUndefined();

      expect(mockFriendbotCall).toHaveBeenCalledTimes(3);
    });
  });

  describe('getBalance()', () => {
    it('returns the native XLM balance for the account', async () => {
      mockLoadAccount.mockResolvedValueOnce({
        balances: [
          { asset_type: 'native', balance: '9999.9999900' },
        ],
      });

      const balance = await getBalance('GBCM3GAOCAPT3YPZCIZ2JKXJQ7YUQFGQE5AQNXFM5LJDQH7ZZQKZVA');

      expect(balance).toBe('9999.9999900');
    });

    it('returns native balance when account has multiple asset balances', async () => {
      mockLoadAccount.mockResolvedValueOnce({
        balances: [
          {
            asset_type: 'credit_alphanum4',
            asset_code: 'USD',
            balance: '100.0000000',
          },
          { asset_type: 'native', balance: '5000.0000000' },
        ],
      });

      const balance = await getBalance('GBCM3GAOCAPT3YPZCIZ2JKXJQ7YUQFGQE5AQNXFM5LJDQH7ZZQKZVA');

      expect(balance).toBe('5000.0000000');
    });

    it('throws when no native balance is found', async () => {
      mockLoadAccount.mockResolvedValueOnce({
        balances: [
          {
            asset_type: 'credit_alphanum4',
            asset_code: 'USD',
            balance: '100.0000000',
          },
        ],
      });

      await expect(
        getBalance('GBCM3GAOCAPT3YPZCIZ2JKXJQ7YUQFGQE5AQNXFM5LJDQH7ZZQKZVA')
      ).rejects.toThrow(/No native balance found/);
    });

    it('throws when loadAccount fails', async () => {
      mockLoadAccount.mockRejectedValueOnce(new Error('Account not found'));

      await expect(
        getBalance('GNOTFOUND')
      ).rejects.toThrow('Account not found');
    });
  });

  describe('submitPayment()', () => {
    beforeEach(() => {
      mockLoadAccount.mockResolvedValue({
        accountId: () => 'GBCM3GAOCAPT3YPZCIZ2JKXJQ7YUQFGQE5AQNXFM5LJDQH7ZZQKZVA',
        sequenceNumber: () => '12345',
        incrementSequenceNumber: jest.fn(),
      });

      mockSubmitTransaction.mockResolvedValue({
        hash: 'abc123def456',
        successful: true,
      });
    });

    it('returns the transaction hash on successful submission', async () => {
      const result = await submitPayment(
        'SCZANGBA5YHTNYVVV3C7CAZMCLXPILHSE7KA52FYI7RCZPYDHO2SYZXGT',
        'GDEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDE',
        '100.5'
      );

      expect(result).toHaveProperty('transactionId');
      expect(result.transactionId).toBe('abc123def456');
    });

    it('uses Keypair.fromSecret to reconstruct the sender keypair', async () => {
      await submitPayment(
        'SCZANGBA5YHTNYVVV3C7CAZMCLXPILHSE7KA52FYI7RCZPYDHO2SYZXGT',
        'GDEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDE',
        '50'
      );

      expect(Keypair.fromSecret).toHaveBeenCalledWith(
        'SCZANGBA5YHTNYVVV3C7CAZMCLXPILHSE7KA52FYI7RCZPYDHO2SYZXGT'
      );
    });

    it('creates a payment operation with the correct parameters', async () => {
      await submitPayment(
        'SCZANGBA5YHTNYVVV3C7CAZMCLXPILHSE7KA52FYI7RCZPYDHO2SYZXGT',
        'GDEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDE',
        '25.5'
      );

      expect(Operation.payment).toHaveBeenCalledWith(
        expect.objectContaining({
          destination: 'GDEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDE',
          amount: '25.5',
        })
      );
    });

    it('adds a memo when one is provided', async () => {
      await submitPayment(
        'SCZANGBA5YHTNYVVV3C7CAZMCLXPILHSE7KA52FYI7RCZPYDHO2SYZXGT',
        'GDEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDE',
        '10',
        'Payment for coffee'
      );

      expect(Memo.text).toHaveBeenCalledWith('Payment for coffee');
      expect(mockAddMemo).toHaveBeenCalled();
    });

    it('does not add a memo when none is provided', async () => {
      await submitPayment(
        'SCZANGBA5YHTNYVVV3C7CAZMCLXPILHSE7KA52FYI7RCZPYDHO2SYZXGT',
        'GDEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDE',
        '10'
      );

      expect(Memo.text).not.toHaveBeenCalled();
      expect(mockAddMemo).not.toHaveBeenCalled();
    });

    it('signs the transaction before submitting', async () => {
      await submitPayment(
        'SCZANGBA5YHTNYVVV3C7CAZMCLXPILHSE7KA52FYI7RCZPYDHO2SYZXGT',
        'GDEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDE',
        '10'
      );

      expect(mockSign).toHaveBeenCalledTimes(1);
    });

    it('submits the transaction to the Horizon server', async () => {
      await submitPayment(
        'SCZANGBA5YHTNYVVV3C7CAZMCLXPILHSE7KA52FYI7RCZPYDHO2SYZXGT',
        'GDEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDE',
        '10'
      );

      expect(mockSubmitTransaction).toHaveBeenCalledTimes(1);
    });

    it('throws when Horizon rejects the transaction', async () => {
      mockSubmitTransaction.mockRejectedValueOnce(
        new Error('Transaction failed: tx_bad_seq')
      );

      await expect(
        submitPayment(
          'SCZANGBA5YHTNYVVV3C7CAZMCLXPILHSE7KA52FYI7RCZPYDHO2SYZXGT',
          'GDEST1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDE',
          '10'
        )
      ).rejects.toThrow('Transaction failed');
    });
  });

  describe('streamPayments()', () => {
    it('opens a stream for the given public key', () => {
      const closeFn = jest.fn();
      mockStream.mockReturnValue(closeFn);

      streamPayments('GBCM3GAOCAPT3YPZCIZ2JKXJQ7YUQFGQE5AQNXFM5LJDQH7ZZQKZVA', jest.fn());

      expect(mockForAccount).toHaveBeenCalledWith(
        'GBCM3GAOCAPT3YPZCIZ2JKXJQ7YUQFGQE5AQNXFM5LJDQH7ZZQKZVA'
      );
    });

    it('sets cursor to "now" for real-time streaming', () => {
      const closeFn = jest.fn();
      mockStream.mockReturnValue(closeFn);

      streamPayments('GBCM3GAOCAPT3YPZCIZ2JKXJQ7YUQFGQE5AQNXFM5LJDQH7ZZQKZVA', jest.fn());

      expect(mockCursor).toHaveBeenCalledWith('now');
    });

    it('returns a close function to stop the stream', () => {
      const closeFn = jest.fn();
      mockStream.mockReturnValue(closeFn);

      const result = streamPayments(
        'GBCM3GAOCAPT3YPZCIZ2JKXJQ7YUQFGQE5AQNXFM5LJDQH7ZZQKZVA',
        jest.fn()
      );

      expect(typeof result).toBe('function');
      expect(result).toBe(closeFn);
    });

    it('passes onmessage and onerror callbacks to stream options', () => {
      const closeFn = jest.fn();
      mockStream.mockReturnValue(closeFn);
      const onPayment = jest.fn();

      streamPayments('GBCM3GAOCAPT3YPZCIZ2JKXJQ7YUQFGQE5AQNXFM5LJDQH7ZZQKZVA', onPayment);

      expect(mockStream).toHaveBeenCalledWith(
        expect.objectContaining({
          onmessage: expect.any(Function),
          onerror: expect.any(Function),
        })
      );
    });

    it('invokes the onPayment callback when a payment is received', () => {
      const closeFn = jest.fn();
      mockStream.mockImplementation(
        (options: { onmessage: (p: unknown) => void }) => {
          // Simulate a payment event arriving
          options.onmessage({
            type: 'payment',
            from: 'GSENDER',
            amount: '50',
          });
          return closeFn;
        }
      );

      const onPayment = jest.fn();
      streamPayments(
        'GBCM3GAOCAPT3YPZCIZ2JKXJQ7YUQFGQE5AQNXFM5LJDQH7ZZQKZVA',
        onPayment
      );

      expect(onPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'payment',
          from: 'GSENDER',
          amount: '50',
        })
      );
    });
  });
});
