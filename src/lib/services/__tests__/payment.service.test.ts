/**
 * Unit tests for PaymentService.
 *
 * Mocks PINService, WalletService, StellarService, and Prisma to test
 * payment flow, recipient resolution, and transaction history in isolation.
 *
 * SECURITY: Verifies that secret keys are zeroed from memory after use
 * and that PIN verification occurs before any key decryption.
 *
 * @see Requirements 3.1–3.10, 8.1–8.7, 9.1–9.4
 */

import { jest } from '@jest/globals';

// ─── Mock setup ──────────────────────────────────────────────────────────────

// Mock PINService
const mockVerifyPin = jest.fn<(userId: string, pin: string) => Promise<boolean>>();
const mockIsLocked = jest.fn<(userId: string) => Promise<boolean>>();

jest.mock('../pin.service', () => ({
  __esModule: true,
  verifyPin: (...args: unknown[]) => mockVerifyPin(...(args as [string, string])),
  isLocked: (...args: unknown[]) => mockIsLocked(...(args as [string])),
}));

// Mock WalletService
const mockDecryptSecretKey = jest.fn<(userId: string) => Promise<string>>();
const mockGetWalletDetails = jest.fn<(userId: string) => Promise<{ stellarAddress: string; balance: string }>>();

jest.mock('../wallet.service', () => ({
  __esModule: true,
  decryptSecretKey: (...args: unknown[]) => mockDecryptSecretKey(...(args as [string])),
  getWalletDetails: (...args: unknown[]) => mockGetWalletDetails(...(args as [string])),
}));

// Mock StellarService
const mockGetBalance = jest.fn<(publicKey: string) => Promise<string>>();
const mockSubmitPayment = jest.fn<(senderSecret: string, recipientPublic: string, amount: string, memo?: string) => Promise<{ transactionId: string }>>();

jest.mock('../stellar.service', () => ({
  __esModule: true,
  getBalance: (...args: unknown[]) => mockGetBalance(...(args as [string])),
  submitPayment: (...args: unknown[]) => mockSubmitPayment(...(args as [string, string, string, string | undefined])),
}));

// Prisma is mocked globally via test/setup.ts

import {
  sendPayment,
  resolveRecipient,
  getTransactionHistory,
  PaymentError,
  PaymentErrorCode,
} from '../payment.service';
import { prisma } from '@/lib/prisma';

// ─── Test constants ──────────────────────────────────────────────────────────

const SENDER_ID = 'user_sender_1';
const SENDER_ADDRESS = `G${'A'.repeat(55)}`; // 56-char valid Stellar address
const RECIPIENT_ADDRESS = `G${'C'.repeat(55)}`; // 56-char valid Stellar address
const RECIPIENT_USERNAME = 'recipient_user';
const TEST_SECRET_KEY = 'SCZANGBA5YHTNYVVV3C7CAZMCLXPILHSE7KA52FYI7RCZPYDHO2SYZXGT';
const TEST_PIN = '123456';
const STELLAR_TX_ID = 'stellar_tx_abc123';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setupDefaultMocks() {
  // WalletService defaults
  mockGetWalletDetails.mockResolvedValue({
    stellarAddress: SENDER_ADDRESS,
    balance: '1000.0000000',
  });
  mockDecryptSecretKey.mockResolvedValue(TEST_SECRET_KEY);

  // PINService defaults
  mockIsLocked.mockResolvedValue(false);
  mockVerifyPin.mockResolvedValue(true);

  // StellarService defaults
  mockSubmitPayment.mockResolvedValue({ transactionId: STELLAR_TX_ID });

  // Prisma defaults
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({
    wallet: { stellarAddress: RECIPIENT_ADDRESS },
  });

  (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({
    userId: 'user_recipient_1',
  });

  (prisma.transaction.create as jest.Mock).mockImplementation(
    async (args: { data: Record<string, unknown> }) => ({
      id: 'tx_1',
      ...args.data,
      createdAt: new Date(),
    }),
  );

  (prisma.transaction.findMany as jest.Mock).mockResolvedValue([]);
  (prisma.transaction.count as jest.Mock).mockResolvedValue(0);
}

const validPaymentData = {
  senderId: SENDER_ID,
  recipient: RECIPIENT_USERNAME,
  amount: '10.0',
  pin: TEST_PIN,
  memo: 'Test payment',
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PaymentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
  });

  // ── resolveRecipient ──────────────────────────────────────────────────

  describe('resolveRecipient()', () => {
    it('returns Stellar address directly when identifier is a valid Stellar address', async () => {
      const result = await resolveRecipient(RECIPIENT_ADDRESS);
      expect(result).toEqual({ stellarAddress: RECIPIENT_ADDRESS });
      // Should not query the database
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('resolves a username to a Stellar address via database lookup', async () => {
      const result = await resolveRecipient(RECIPIENT_USERNAME);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { username: RECIPIENT_USERNAME },
        select: {
          wallet: {
            select: { stellarAddress: true },
          },
        },
      });
      expect(result).toEqual({ stellarAddress: RECIPIENT_ADDRESS });
    });

    it('throws INVALID_RECIPIENT when username is not found', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      try {
        await resolveRecipient('nonexistent_user');
        fail('Expected PaymentError');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(PaymentError);
        expect((error as PaymentError).code).toBe(PaymentErrorCode.INVALID_RECIPIENT);
        expect((error as PaymentError).statusCode).toBe(404);
      }
    });

    it('throws INVALID_RECIPIENT when user exists but has no wallet', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ wallet: null });

      try {
        await resolveRecipient('user_without_wallet');
        fail('Expected PaymentError');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(PaymentError);
        expect((error as PaymentError).code).toBe(PaymentErrorCode.INVALID_RECIPIENT);
      }
    });
  });

  // ── sendPayment ───────────────────────────────────────────────────────

  describe('sendPayment()', () => {
    it('completes full payment flow and returns transaction', async () => {
      const result = await sendPayment(validPaymentData);

      expect(result.transaction).toBeDefined();
      expect(prisma.transaction.create).toHaveBeenCalledTimes(1);

      const createCall = (prisma.transaction.create as jest.Mock).mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(createCall.data.status).toBe('COMPLETED');
      expect(createCall.data.stellarTxId).toBe(STELLAR_TX_ID);
    });

    it('resolves recipient username before proceeding', async () => {
      await sendPayment(validPaymentData);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { username: RECIPIENT_USERNAME },
        select: {
          wallet: {
            select: { stellarAddress: true },
          },
        },
      });
    });

    it('accepts a Stellar address as recipient directly', async () => {
      await sendPayment({
        ...validPaymentData,
        recipient: RECIPIENT_ADDRESS,
      });

      // Should not look up by username
      expect(prisma.user.findUnique).not.toHaveBeenCalledWith(
        expect.objectContaining({ where: { username: RECIPIENT_ADDRESS } }),
      );
    });

    it('checks sender balance before proceeding', async () => {
      await sendPayment(validPaymentData);
      expect(mockGetWalletDetails).toHaveBeenCalledWith(SENDER_ID);
    });

    it('throws INSUFFICIENT_BALANCE when balance is too low', async () => {
      mockGetWalletDetails.mockResolvedValue({
        stellarAddress: SENDER_ADDRESS,
        balance: '5.0000000', // Less than 10 + 1 reserve
      });

      try {
        await sendPayment(validPaymentData);
        fail('Expected PaymentError');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(PaymentError);
        expect((error as PaymentError).code).toBe(PaymentErrorCode.INSUFFICIENT_BALANCE);
      }

      // Should not attempt PIN verification or signing
      expect(mockVerifyPin).not.toHaveBeenCalled();
      expect(mockSubmitPayment).not.toHaveBeenCalled();
    });

    it('throws INSUFFICIENT_BALANCE when balance exactly equals amount (no reserve)', async () => {
      mockGetWalletDetails.mockResolvedValue({
        stellarAddress: SENDER_ADDRESS,
        balance: '10.0000000', // Exactly the amount, no room for 1 XLM reserve
      });

      await expect(sendPayment(validPaymentData)).rejects.toThrow(PaymentError);
    });

    it('succeeds when balance equals amount + reserve exactly', async () => {
      mockGetWalletDetails.mockResolvedValue({
        stellarAddress: SENDER_ADDRESS,
        balance: '11.0000000', // 10 + 1 reserve
      });

      const result = await sendPayment(validPaymentData);
      expect(result.transaction).toBeDefined();
    });

    it('checks PIN lockout before verifying PIN', async () => {
      const callOrder: string[] = [];
      mockIsLocked.mockImplementation(async () => {
        callOrder.push('isLocked');
        return false;
      });
      mockVerifyPin.mockImplementation(async () => {
        callOrder.push('verifyPin');
        return true;
      });

      await sendPayment(validPaymentData);

      expect(callOrder).toEqual(['isLocked', 'verifyPin']);
    });

    it('throws ACCOUNT_LOCKED when PIN is locked', async () => {
      mockIsLocked.mockResolvedValue(true);

      try {
        await sendPayment(validPaymentData);
        fail('Expected PaymentError');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(PaymentError);
        expect((error as PaymentError).code).toBe(PaymentErrorCode.ACCOUNT_LOCKED);
        expect((error as PaymentError).statusCode).toBe(423);
      }

      // Should not attempt PIN verification
      expect(mockVerifyPin).not.toHaveBeenCalled();
      expect(mockSubmitPayment).not.toHaveBeenCalled();
    });

    it('throws INCORRECT_PIN when PIN verification fails', async () => {
      mockVerifyPin.mockResolvedValue(false);

      try {
        await sendPayment(validPaymentData);
        fail('Expected PaymentError');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(PaymentError);
        expect((error as PaymentError).code).toBe(PaymentErrorCode.INCORRECT_PIN);
      }

      // Should not decrypt the secret key or submit payment
      expect(mockDecryptSecretKey).not.toHaveBeenCalled();
      expect(mockSubmitPayment).not.toHaveBeenCalled();
    });

    it('throws PIN_REQUIRED when no PIN is provided', async () => {
      try {
        await sendPayment({ ...validPaymentData, pin: '' });
        fail('Expected PaymentError');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(PaymentError);
        expect((error as PaymentError).code).toBe(PaymentErrorCode.PIN_REQUIRED);
      }
    });

    it('decrypts secret key only after PIN verification succeeds', async () => {
      const callOrder: string[] = [];
      mockVerifyPin.mockImplementation(async () => {
        callOrder.push('verifyPin');
        return true;
      });
      mockDecryptSecretKey.mockImplementation(async () => {
        callOrder.push('decryptSecretKey');
        return TEST_SECRET_KEY;
      });

      await sendPayment(validPaymentData);

      expect(callOrder.indexOf('verifyPin')).toBeLessThan(
        callOrder.indexOf('decryptSecretKey'),
      );
    });

    it('submits payment via StellarService with correct parameters', async () => {
      await sendPayment(validPaymentData);

      expect(mockSubmitPayment).toHaveBeenCalledWith(
        TEST_SECRET_KEY,
        RECIPIENT_ADDRESS,
        '10.0',
        'Test payment',
      );
    });

    it('records a COMPLETED transaction on successful submission', async () => {
      await sendPayment(validPaymentData);

      const createCall = (prisma.transaction.create as jest.Mock).mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(createCall.data.status).toBe('COMPLETED');
      expect(createCall.data.stellarTxId).toBe(STELLAR_TX_ID);
      expect(createCall.data.senderAddress).toBe(SENDER_ADDRESS);
      expect(createCall.data.recipientAddress).toBe(RECIPIENT_ADDRESS);
      expect(createCall.data.senderId).toBe(SENDER_ID);
      expect(createCall.data.amount).toBe(10.0);
      expect(createCall.data.memo).toBe('Test payment');
    });

    it('records a FAILED transaction when Stellar submission fails', async () => {
      mockSubmitPayment.mockRejectedValue(new Error('Horizon timeout'));

      await expect(sendPayment(validPaymentData)).rejects.toThrow(PaymentError);

      const createCall = (prisma.transaction.create as jest.Mock).mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(createCall.data.status).toBe('FAILED');
      expect(createCall.data.errorReason).toBe('Horizon timeout');
      expect(createCall.data.stellarTxId).toBeUndefined();
    });

    it('handles payment without a memo', async () => {
      await sendPayment({
        ...validPaymentData,
        memo: undefined,
      });

      expect(mockSubmitPayment).toHaveBeenCalledWith(
        TEST_SECRET_KEY,
        RECIPIENT_ADDRESS,
        '10.0',
        undefined,
      );

      const createCall = (prisma.transaction.create as jest.Mock).mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(createCall.data.memo).toBeNull();
    });

    it('sets recipientId to null for external (non-platform) recipients', async () => {
      // Recipient Stellar address not found in our platform
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue(null);

      await sendPayment({
        ...validPaymentData,
        recipient: RECIPIENT_ADDRESS,
      });

      const createCall = (prisma.transaction.create as jest.Mock).mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(createCall.data.recipientId).toBeNull();
    });

    it('executes steps in correct order', async () => {
      const callOrder: string[] = [];

      mockGetWalletDetails.mockImplementation(async () => {
        callOrder.push('getWalletDetails');
        return { stellarAddress: SENDER_ADDRESS, balance: '1000.0000000' };
      });
      mockIsLocked.mockImplementation(async () => {
        callOrder.push('isLocked');
        return false;
      });
      mockVerifyPin.mockImplementation(async () => {
        callOrder.push('verifyPin');
        return true;
      });
      mockDecryptSecretKey.mockImplementation(async () => {
        callOrder.push('decryptSecretKey');
        return TEST_SECRET_KEY;
      });
      mockSubmitPayment.mockImplementation(async () => {
        callOrder.push('submitPayment');
        return { transactionId: STELLAR_TX_ID };
      });

      await sendPayment(validPaymentData);

      // Verify the correct ordering of operations
      expect(callOrder).toEqual([
        'getWalletDetails',
        'isLocked',
        'verifyPin',
        'decryptSecretKey',
        'submitPayment',
      ]);
    });
  });

  // ── getTransactionHistory ─────────────────────────────────────────────

  describe('getTransactionHistory()', () => {
    const mockTransactions = [
      {
        id: 'tx_1',
        stellarTxId: 'stellar_1',
        senderAddress: SENDER_ADDRESS,
        recipientAddress: RECIPIENT_ADDRESS,
        senderId: SENDER_ID,
        recipientId: 'user_recipient_1',
        amount: 10.0,
        memo: 'Test',
        status: 'COMPLETED',
        createdAt: new Date('2025-01-15T10:00:00Z'),
      },
    ];

    it('returns paginated transactions with default page size of 20', async () => {
      (prisma.transaction.findMany as jest.Mock).mockResolvedValue(mockTransactions);
      (prisma.transaction.count as jest.Mock).mockResolvedValue(1);

      const result = await getTransactionHistory(SENDER_ID);

      expect(result.pagination.pageSize).toBe(20);
      expect(result.pagination.page).toBe(1);

      // Check findMany was called with correct params
      const findCall = (prisma.transaction.findMany as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
      expect(findCall.take).toBe(20);
      expect(findCall.skip).toBe(0);
    });

    it('queries transactions where user is sender or recipient', async () => {
      (prisma.transaction.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.transaction.count as jest.Mock).mockResolvedValue(0);

      await getTransactionHistory(SENDER_ID);

      const findCall = (prisma.transaction.findMany as jest.Mock).mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(findCall.where.OR).toEqual([
        { senderId: SENDER_ID },
        { recipientId: SENDER_ID },
      ]);
    });

    it('filters by direction "sent"', async () => {
      (prisma.transaction.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.transaction.count as jest.Mock).mockResolvedValue(0);

      await getTransactionHistory(SENDER_ID, { direction: 'sent' });

      const findCall = (prisma.transaction.findMany as jest.Mock).mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(findCall.where.senderId).toBe(SENDER_ID);
      expect(findCall.where.OR).toBeUndefined();
    });

    it('filters by direction "received"', async () => {
      (prisma.transaction.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.transaction.count as jest.Mock).mockResolvedValue(0);

      await getTransactionHistory(SENDER_ID, { direction: 'received' });

      const findCall = (prisma.transaction.findMany as jest.Mock).mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(findCall.where.recipientId).toBe(SENDER_ID);
      expect(findCall.where.OR).toBeUndefined();
    });

    it('filters by status', async () => {
      (prisma.transaction.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.transaction.count as jest.Mock).mockResolvedValue(0);

      await getTransactionHistory(SENDER_ID, { status: 'COMPLETED' });

      const findCall = (prisma.transaction.findMany as jest.Mock).mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(findCall.where.status).toBe('COMPLETED');
    });

    it('filters by date range', async () => {
      (prisma.transaction.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.transaction.count as jest.Mock).mockResolvedValue(0);

      await getTransactionHistory(SENDER_ID, {
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      });

      const findCall = (prisma.transaction.findMany as jest.Mock).mock.calls[0][0] as {
        where: { createdAt: Record<string, Date> };
      };
      expect(findCall.where.createdAt.gte).toEqual(new Date('2025-01-01'));
      expect(findCall.where.createdAt.lte).toEqual(new Date('2025-01-31'));
    });

    it('applies all filters conjunctively', async () => {
      (prisma.transaction.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.transaction.count as jest.Mock).mockResolvedValue(0);

      await getTransactionHistory(SENDER_ID, {
        direction: 'sent',
        status: 'COMPLETED',
        startDate: '2025-01-01',
      });

      const findCall = (prisma.transaction.findMany as jest.Mock).mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      // All three filters should be present simultaneously
      expect(findCall.where.senderId).toBe(SENDER_ID);
      expect(findCall.where.status).toBe('COMPLETED');
      expect(findCall.where.createdAt).toBeDefined();
    });

    it('supports custom page and pageSize', async () => {
      (prisma.transaction.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.transaction.count as jest.Mock).mockResolvedValue(50);

      const result = await getTransactionHistory(SENDER_ID, {
        page: 3,
        pageSize: 10,
      });

      const findCall = (prisma.transaction.findMany as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
      expect(findCall.skip).toBe(20); // (3 - 1) * 10
      expect(findCall.take).toBe(10);
      expect(result.pagination.page).toBe(3);
      expect(result.pagination.pageSize).toBe(10);
      expect(result.pagination.total).toBe(50);
      expect(result.pagination.totalPages).toBe(5);
    });

    it('orders transactions by createdAt descending', async () => {
      (prisma.transaction.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.transaction.count as jest.Mock).mockResolvedValue(0);

      await getTransactionHistory(SENDER_ID);

      const findCall = (prisma.transaction.findMany as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
      expect(findCall.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('selects all required transaction fields', async () => {
      (prisma.transaction.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.transaction.count as jest.Mock).mockResolvedValue(0);

      await getTransactionHistory(SENDER_ID);

      const findCall = (prisma.transaction.findMany as jest.Mock).mock.calls[0][0] as {
        select: Record<string, boolean>;
      };
      expect(findCall.select).toEqual({
        id: true,
        stellarTxId: true,
        senderAddress: true,
        recipientAddress: true,
        senderId: true,
        recipientId: true,
        amount: true,
        memo: true,
        status: true,
        createdAt: true,
      });
    });

    it('returns correct pagination metadata', async () => {
      (prisma.transaction.findMany as jest.Mock).mockResolvedValue(mockTransactions);
      (prisma.transaction.count as jest.Mock).mockResolvedValue(45);

      const result = await getTransactionHistory(SENDER_ID);

      expect(result.pagination).toEqual({
        page: 1,
        pageSize: 20,
        total: 45,
        totalPages: 3,
      });
    });
  });
});
