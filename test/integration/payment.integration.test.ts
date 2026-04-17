/**
 * Integration tests for the payment flow.
 *
 * Tests the full payment lifecycle through the API route handler:
 * - Full send-payment: resolve recipient → verify PIN → decrypt → sign → submit → record
 * - Insufficient balance rejection before Stellar submission
 * - Incorrect PIN rejection (no transaction signed)
 * - Failed Stellar submission recorded as "failed" with error reason
 * - Recipient resolution: username → Stellar address, non-existent recipient error
 *
 * External services (Stellar SDK, Encryption) are mocked, but the actual
 * service layer logic (PaymentService, PINService, WalletService) is exercised
 * end-to-end through the route handler.
 *
 * @see Requirements 3.1–3.10, 4.3, 4.4
 */

import { POST as sendPaymentHandler } from '../../src/app/api/payments/send/route';
import { paymentRateLimiter } from '../../src/lib/middleware/rate-limiter';
import { prisma } from '../../src/lib/prisma';
import * as StellarService from '../../src/lib/services/stellar.service';

// ── Mock Stellar and Encryption services ────────────────────────────────

jest.mock('../../src/lib/services/stellar.service', () => ({
  generateKeypair: jest.fn().mockReturnValue({
    publicKey: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV',
    secretKey: 'SABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV',
  }),
  fundAccount: jest.fn().mockResolvedValue(undefined),
  getBalance: jest.fn().mockResolvedValue('10000.0000000'),
  submitPayment: jest.fn().mockResolvedValue({ transactionId: 'stellar_tx_abc123' }),
  streamPayments: jest.fn(),
}));

jest.mock('../../src/lib/services/encryption.service', () => ({
  encrypt: jest.fn().mockReturnValue({
    ciphertext: 'mock_encrypted_secret',
    iv: 'mock_iv_hex',
    authTag: 'mock_auth_tag_hex',
  }),
  decrypt: jest.fn().mockReturnValue('mock_decrypted_secret_key'),
}));

// ── Typed references to mocked Prisma client ────────────────────────────

const mockPrisma = prisma as unknown as {
  user: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    count: jest.Mock;
  };
  wallet: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  transaction: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    count: jest.Mock;
  };
};

// ── Helpers ──────────────────────────────────────────────────────────────

/** Builds a POST request to /api/payments/send with JSON body and auth headers. */
function buildSendRequest(
  body: unknown,
  options?: {
    userId?: string;
    role?: string;
    omitCsrf?: boolean;
  },
): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };

  if (!options?.omitCsrf) {
    headers['x-csrf-token'] = 'test-csrf-token';
  }

  headers['x-user-id'] = options?.userId ?? 'sender-user-1';
  headers['x-user-role'] = options?.role ?? 'USER';

  return new Request('http://localhost/api/payments/send', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

const SENDER_USER_ID = 'sender-user-1';
const SENDER_STELLAR_ADDRESS = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV';
const RECIPIENT_STELLAR_ADDRESS = 'GCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';

const validPayload = {
  recipient: 'alice',
  amount: 50,
  pin: '1234',
  memo: 'Test payment',
};

// ── Test Suite ───────────────────────────────────────────────────────────

describe('Payment Integration Tests', () => {
  // Pre-compute a bcrypt hash for PIN '1234'
  let pinHash1234: string;

  beforeAll(async () => {
    const bcrypt = await import('bcryptjs');
    pinHash1234 = await bcrypt.default.hash('1234', 12);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    paymentRateLimiter.clear();

    process.env.JWT_SECRET = 'test-jwt-secret-for-integration-tests';
    process.env.ENCRYPTION_MASTER_KEY = 'test-encryption-master-key';
  });

  // ── Full Send-Payment Flow ──────────────────────────────────────────

  describe('Full send-payment flow: resolve → PIN → decrypt → sign → submit → record', () => {
    it('completes the full payment flow and records a COMPLETED transaction', async () => {
      // Arrange: recipient resolution — alice has a wallet
      mockPrisma.user.findUnique.mockImplementation((args: { where: { username?: string; id?: string } }) => {
        if (args.where.username === 'alice') {
          return Promise.resolve({
            wallet: { stellarAddress: RECIPIENT_STELLAR_ADDRESS },
          });
        }
        // For sender PIN verification lookup
        if (args.where.id === SENDER_USER_ID) {
          return Promise.resolve({
            id: SENDER_USER_ID,
            pinHash: pinHash1234,
            failedPinAttempts: 0,
            pinLockedUntil: null,
          });
        }
        return Promise.resolve(null);
      });

      // Sender wallet details (getWalletDetails)
      mockPrisma.wallet.findUnique.mockImplementation((args: { where: { userId?: string; stellarAddress?: string } }) => {
        if (args.where.userId === SENDER_USER_ID) {
          return Promise.resolve({
            stellarAddress: SENDER_STELLAR_ADDRESS,
            encryptedSecretKey: 'mock_encrypted_secret',
            encryptionIV: 'mock_iv_hex',
            authTag: 'mock_auth_tag_hex',
          });
        }
        // Recipient wallet lookup for recipientId
        if (args.where.stellarAddress === RECIPIENT_STELLAR_ADDRESS) {
          return Promise.resolve({ userId: 'recipient-user-1' });
        }
        return Promise.resolve(null);
      });

      // Stellar balance check
      (StellarService.getBalance as jest.Mock).mockResolvedValue('10000.0000000');

      // Stellar submission succeeds
      (StellarService.submitPayment as jest.Mock).mockResolvedValue({
        transactionId: 'stellar_tx_abc123',
      });

      // PIN verification — reset failed attempts on success
      mockPrisma.user.update.mockResolvedValue({});

      // Transaction recording
      const mockTransaction = {
        id: 'tx-integration-1',
        stellarTxId: 'stellar_tx_abc123',
        senderAddress: SENDER_STELLAR_ADDRESS,
        recipientAddress: RECIPIENT_STELLAR_ADDRESS,
        senderId: SENDER_USER_ID,
        recipientId: 'recipient-user-1',
        amount: 50,
        memo: 'Test payment',
        status: 'COMPLETED',
        createdAt: new Date(),
      };
      mockPrisma.transaction.create.mockResolvedValue(mockTransaction);

      // Act
      const request = buildSendRequest(validPayload);
      const response = await sendPaymentHandler(request);
      const data = await response.json();

      // Assert: 200 OK with transaction details
      expect(response.status).toBe(200);
      expect(data.transaction).toBeDefined();
      expect(data.transaction.stellarTxId).toBe('stellar_tx_abc123');
      expect(data.transaction.status).toBe('COMPLETED');
      expect(data.transaction.amount).toBe(50);
      expect(data.transaction.memo).toBe('Test payment');

      // Verify recipient was resolved (username lookup)
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { username: 'alice' },
        }),
      );

      // Verify Stellar payment was submitted with decrypted secret key
      expect(StellarService.submitPayment).toHaveBeenCalledWith(
        'mock_decrypted_secret_key',
        RECIPIENT_STELLAR_ADDRESS,
        '50',
        'Test payment',
      );

      // Verify transaction was recorded as COMPLETED
      expect(mockPrisma.transaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          stellarTxId: 'stellar_tx_abc123',
          senderAddress: SENDER_STELLAR_ADDRESS,
          recipientAddress: RECIPIENT_STELLAR_ADDRESS,
          senderId: SENDER_USER_ID,
          recipientId: 'recipient-user-1',
          amount: 50,
          memo: 'Test payment',
          status: 'COMPLETED',
        }),
      });
    });
  });

  // ── Insufficient Balance Rejection ──────────────────────────────────

  describe('Insufficient balance rejection', () => {
    it('rejects payment when sender balance < amount + 1 XLM reserve', async () => {
      // Arrange: recipient resolution
      mockPrisma.user.findUnique.mockImplementation((args: { where: { username?: string; id?: string } }) => {
        if (args.where.username === 'alice') {
          return Promise.resolve({
            wallet: { stellarAddress: RECIPIENT_STELLAR_ADDRESS },
          });
        }
        return Promise.resolve(null);
      });

      // Sender wallet with low balance
      mockPrisma.wallet.findUnique.mockImplementation((args: { where: { userId?: string } }) => {
        if (args.where.userId === SENDER_USER_ID) {
          return Promise.resolve({
            stellarAddress: SENDER_STELLAR_ADDRESS,
          });
        }
        return Promise.resolve(null);
      });

      // Balance is 10 XLM, trying to send 50 XLM (needs 51 XLM total)
      (StellarService.getBalance as jest.Mock).mockResolvedValue('10.0000000');

      // Act
      const request = buildSendRequest(validPayload);
      const response = await sendPaymentHandler(request);
      const data = await response.json();

      // Assert: 400 with insufficient balance error
      expect(response.status).toBe(400);
      expect(data.error).toContain('Insufficient balance');
      expect(data.code).toBe('INSUFFICIENT_BALANCE');

      // Verify no Stellar transaction was submitted
      expect(StellarService.submitPayment).not.toHaveBeenCalled();

      // Verify no transaction was recorded
      expect(mockPrisma.transaction.create).not.toHaveBeenCalled();
    });
  });

  // ── Incorrect PIN Rejection ─────────────────────────────────────────

  describe('Incorrect PIN rejection', () => {
    it('rejects payment with incorrect PIN and does not sign any transaction', async () => {
      // Arrange: recipient resolution
      mockPrisma.user.findUnique.mockImplementation((args: { where: { username?: string; id?: string } }) => {
        if (args.where.username === 'alice') {
          return Promise.resolve({
            wallet: { stellarAddress: RECIPIENT_STELLAR_ADDRESS },
          });
        }
        // Sender PIN verification — PIN hash is for '1234', but we'll send '9999'
        if (args.where.id === SENDER_USER_ID) {
          return Promise.resolve({
            id: SENDER_USER_ID,
            pinHash: pinHash1234,
            failedPinAttempts: 0,
            pinLockedUntil: null,
          });
        }
        return Promise.resolve(null);
      });

      // Sender wallet details
      mockPrisma.wallet.findUnique.mockImplementation((args: { where: { userId?: string } }) => {
        if (args.where.userId === SENDER_USER_ID) {
          return Promise.resolve({
            stellarAddress: SENDER_STELLAR_ADDRESS,
          });
        }
        return Promise.resolve(null);
      });

      // Sufficient balance
      (StellarService.getBalance as jest.Mock).mockResolvedValue('10000.0000000');

      // PIN update for failed attempt tracking
      mockPrisma.user.update.mockResolvedValue({});

      // Act: send with wrong PIN
      const request = buildSendRequest({
        ...validPayload,
        pin: '9999',
      });
      const response = await sendPaymentHandler(request);
      const data = await response.json();

      // Assert: 400 with incorrect PIN error
      expect(response.status).toBe(400);
      expect(data.error).toContain('Incorrect transaction PIN');
      expect(data.code).toBe('INCORRECT_PIN');

      // Verify no Stellar transaction was submitted
      expect(StellarService.submitPayment).not.toHaveBeenCalled();

      // Verify no transaction was recorded
      expect(mockPrisma.transaction.create).not.toHaveBeenCalled();
    });
  });

  // ── Failed Stellar Submission ───────────────────────────────────────

  describe('Failed Stellar submission', () => {
    it('records transaction as "failed" with error reason when Horizon rejects', async () => {
      // Arrange: recipient resolution
      mockPrisma.user.findUnique.mockImplementation((args: { where: { username?: string; id?: string } }) => {
        if (args.where.username === 'alice') {
          return Promise.resolve({
            wallet: { stellarAddress: RECIPIENT_STELLAR_ADDRESS },
          });
        }
        if (args.where.id === SENDER_USER_ID) {
          return Promise.resolve({
            id: SENDER_USER_ID,
            pinHash: pinHash1234,
            failedPinAttempts: 0,
            pinLockedUntil: null,
          });
        }
        return Promise.resolve(null);
      });

      // Sender wallet details
      mockPrisma.wallet.findUnique.mockImplementation((args: { where: { userId?: string; stellarAddress?: string } }) => {
        if (args.where.userId === SENDER_USER_ID) {
          return Promise.resolve({
            stellarAddress: SENDER_STELLAR_ADDRESS,
            encryptedSecretKey: 'mock_encrypted_secret',
            encryptionIV: 'mock_iv_hex',
            authTag: 'mock_auth_tag_hex',
          });
        }
        if (args.where.stellarAddress === RECIPIENT_STELLAR_ADDRESS) {
          return Promise.resolve({ userId: 'recipient-user-1' });
        }
        return Promise.resolve(null);
      });

      // Sufficient balance
      (StellarService.getBalance as jest.Mock).mockResolvedValue('10000.0000000');

      // PIN verification succeeds
      mockPrisma.user.update.mockResolvedValue({});

      // Stellar submission FAILS
      (StellarService.submitPayment as jest.Mock).mockRejectedValue(
        new Error('tx_failed: op_underfunded'),
      );

      // Transaction recording for failed tx
      const failedTransaction = {
        id: 'tx-failed-1',
        stellarTxId: null,
        senderAddress: SENDER_STELLAR_ADDRESS,
        recipientAddress: RECIPIENT_STELLAR_ADDRESS,
        senderId: SENDER_USER_ID,
        recipientId: 'recipient-user-1',
        amount: 50,
        memo: 'Test payment',
        status: 'FAILED',
        errorReason: 'tx_failed: op_underfunded',
        createdAt: new Date(),
      };
      mockPrisma.transaction.create.mockResolvedValue(failedTransaction);

      // Act
      const request = buildSendRequest(validPayload);
      const response = await sendPaymentHandler(request);
      const data = await response.json();

      // Assert: 502 with Stellar submission failure
      expect(response.status).toBe(502);
      expect(data.error).toContain('Payment failed');
      expect(data.code).toBe('STELLAR_SUBMISSION_FAILED');

      // Verify transaction was recorded as FAILED with error reason
      expect(mockPrisma.transaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          senderAddress: SENDER_STELLAR_ADDRESS,
          recipientAddress: RECIPIENT_STELLAR_ADDRESS,
          senderId: SENDER_USER_ID,
          recipientId: 'recipient-user-1',
          amount: 50,
          memo: 'Test payment',
          status: 'FAILED',
          errorReason: 'tx_failed: op_underfunded',
        }),
      });
    });
  });

  // ── Recipient Resolution ────────────────────────────────────────────

  describe('Recipient resolution', () => {
    it('resolves a username to a Stellar address and completes payment', async () => {
      // Arrange: bob has a wallet
      mockPrisma.user.findUnique.mockImplementation((args: { where: { username?: string; id?: string } }) => {
        if (args.where.username === 'bob') {
          return Promise.resolve({
            wallet: { stellarAddress: RECIPIENT_STELLAR_ADDRESS },
          });
        }
        if (args.where.id === SENDER_USER_ID) {
          return Promise.resolve({
            id: SENDER_USER_ID,
            pinHash: pinHash1234,
            failedPinAttempts: 0,
            pinLockedUntil: null,
          });
        }
        return Promise.resolve(null);
      });

      mockPrisma.wallet.findUnique.mockImplementation((args: { where: { userId?: string; stellarAddress?: string } }) => {
        if (args.where.userId === SENDER_USER_ID) {
          return Promise.resolve({
            stellarAddress: SENDER_STELLAR_ADDRESS,
            encryptedSecretKey: 'mock_encrypted_secret',
            encryptionIV: 'mock_iv_hex',
            authTag: 'mock_auth_tag_hex',
          });
        }
        if (args.where.stellarAddress === RECIPIENT_STELLAR_ADDRESS) {
          return Promise.resolve({ userId: 'bob-user-id' });
        }
        return Promise.resolve(null);
      });

      (StellarService.getBalance as jest.Mock).mockResolvedValue('10000.0000000');
      (StellarService.submitPayment as jest.Mock).mockResolvedValue({
        transactionId: 'stellar_tx_bob_payment',
      });
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.transaction.create.mockResolvedValue({
        id: 'tx-bob-1',
        stellarTxId: 'stellar_tx_bob_payment',
        status: 'COMPLETED',
      });

      // Act
      const request = buildSendRequest({
        ...validPayload,
        recipient: 'bob',
      });
      const response = await sendPaymentHandler(request);
      const data = await response.json();

      // Assert: payment succeeded via username resolution
      expect(response.status).toBe(200);
      expect(data.transaction.stellarTxId).toBe('stellar_tx_bob_payment');

      // Verify the username was looked up
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { username: 'bob' },
        }),
      );

      // Verify Stellar payment was sent to the resolved address
      expect(StellarService.submitPayment).toHaveBeenCalledWith(
        'mock_decrypted_secret_key',
        RECIPIENT_STELLAR_ADDRESS,
        '50',
        'Test payment',
      );
    });

    it('returns error for non-existent recipient username', async () => {
      // Arrange: no user with username 'nonexistent'
      mockPrisma.user.findUnique.mockImplementation((args: { where: { username?: string } }) => {
        if (args.where.username === 'nonexistent') {
          return Promise.resolve(null);
        }
        return Promise.resolve(null);
      });

      // Act
      const request = buildSendRequest({
        ...validPayload,
        recipient: 'nonexistent',
      });
      const response = await sendPaymentHandler(request);
      const data = await response.json();

      // Assert: error before any transaction is constructed
      expect(response.status).toBe(404);
      expect(data.error).toContain('not found');
      expect(data.code).toBe('INVALID_RECIPIENT');

      // Verify no Stellar transaction was submitted
      expect(StellarService.submitPayment).not.toHaveBeenCalled();

      // Verify no transaction was recorded
      expect(mockPrisma.transaction.create).not.toHaveBeenCalled();
    });
  });
});
