/**
 * Property-based tests for transaction history: filter conjunction and required fields.
 *
 * Feature: stellar-pay, Property 25: Transaction history filters applied conjunctively
 * Feature: stellar-pay, Property 26: Transaction records contain all required fields
 *
 * Validates: Requirements 8.2, 8.3, 8.4, 8.5, 8.6
 *
 * Uses fast-check with minimum 100 iterations per property.
 */

import fc from 'fast-check';
import { jest } from '@jest/globals';

// ── Module mocks ─────────────────────────────────────────────────────────────
// payment.service imports pin.service, wallet.service, and stellar.service.
// We mock them even though these tests only exercise getTransactionHistory.

jest.mock('@/lib/services/pin.service', () => ({
  __esModule: true,
  verifyPin: jest.fn(),
  isLocked: jest.fn(),
}));

jest.mock('@/lib/services/wallet.service', () => ({
  __esModule: true,
  decryptSecretKey: jest.fn(),
  getWalletDetails: jest.fn(),
}));

jest.mock('@/lib/services/stellar.service', () => ({
  __esModule: true,
  getBalance: jest.fn(),
  submitPayment: jest.fn(),
}));

// Prisma is already mocked globally via test/setup.ts

// ── Imports (after mocks) ────────────────────────────────────────────────────

import { getTransactionHistory } from '@/lib/services/payment.service';
import { prisma } from '@/lib/prisma';

// ── Typed Prisma mock ────────────────────────────────────────────────────────

const mockPrisma = prisma as unknown as {
  transaction: {
    findMany: jest.Mock;
    count: jest.Mock;
  };
};

// ── Generators ───────────────────────────────────────────────────────────────

/** Generates a valid user ID (cuid-like string). */
const userIdArb = fc
  .stringMatching(/^[a-z][a-z0-9]{8,24}$/)
  .filter((s) => s.length >= 9);

/** Generates valid-looking Stellar addresses: 'G' + 55 base32 chars. */
const stellarAddressArb = fc
  .array(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.split('')), {
    minLength: 55,
    maxLength: 55,
  })
  .map((chars) => 'G' + chars.join(''));

/** Generates an optional direction filter. */
const directionArb = fc.constantFrom(undefined, 'sent' as const, 'received' as const);

/** Generates an optional status filter. */
const statusArb = fc.constantFrom(undefined, 'COMPLETED' as const, 'FAILED' as const);

/** Generates a date within a reasonable range (2023–2025). */
const dateArb = fc
  .date({ min: new Date('2023-01-01'), max: new Date('2025-12-31') })
  .map((d) => d.toISOString());

/** Generates an optional date range (startDate, endDate) ensuring start <= end. */
const dateRangeArb = fc.oneof(
  // No date range
  fc.constant({ startDate: undefined as string | undefined, endDate: undefined as string | undefined }),
  // Only startDate
  dateArb.map((d) => ({ startDate: d, endDate: undefined as string | undefined })),
  // Only endDate
  dateArb.map((d) => ({ startDate: undefined as string | undefined, endDate: d })),
  // Both startDate and endDate, ensuring start <= end
  fc
    .tuple(dateArb, dateArb)
    .map(([a, b]) =>
      new Date(a) <= new Date(b)
        ? { startDate: a, endDate: b }
        : { startDate: b, endDate: a },
    ),
);

/** Generates a random transaction status for mock data. */
const txStatusArb = fc.constantFrom('COMPLETED' as const, 'FAILED' as const);

/** Generates positive amounts as Decimal-style numbers. */
const amountArb = fc
  .float({ min: Math.fround(0.01), max: Math.fround(9999), noNaN: true })
  .filter((n) => n > 0)
  .map((n) => n.toFixed(7));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('TransactionHistory — Property Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Property 25 ──────────────────────────────────────────────────────

  describe('Property 25: Transaction history filters applied conjunctively', () => {
    // Feature: stellar-pay, Property 25: Transaction history filters applied conjunctively
    it('builds a where clause that includes all specified filters simultaneously', async () => {
      /**
       * Validates: Requirements 8.2, 8.3, 8.4, 8.5
       *
       * For any combination of direction, status, and date range filters,
       * the Prisma where clause passed to findMany and count should contain
       * all specified filters simultaneously (conjunctive application).
       */
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          directionArb,
          statusArb,
          dateRangeArb,
          async (userId, direction, status, dateRange) => {
            jest.clearAllMocks();

            // Mock Prisma to return empty results — we only care about the where clause
            mockPrisma.transaction.findMany.mockResolvedValue([]);
            mockPrisma.transaction.count.mockResolvedValue(0);

            const filters: {
              direction?: 'sent' | 'received';
              status?: 'COMPLETED' | 'FAILED';
              startDate?: string;
              endDate?: string;
            } = {};

            if (direction !== undefined) filters.direction = direction;
            if (status !== undefined) filters.status = status;
            if (dateRange.startDate !== undefined) filters.startDate = dateRange.startDate;
            if (dateRange.endDate !== undefined) filters.endDate = dateRange.endDate;

            await getTransactionHistory(userId, filters);

            // Extract the where clause passed to findMany
            expect(mockPrisma.transaction.findMany).toHaveBeenCalledTimes(1);
            const findManyCall = mockPrisma.transaction.findMany.mock.calls[0][0] as {
              where: Record<string, unknown>;
            };
            const where = findManyCall.where;

            // Also verify count received the same where clause
            expect(mockPrisma.transaction.count).toHaveBeenCalledTimes(1);
            const countCall = mockPrisma.transaction.count.mock.calls[0][0] as {
              where: Record<string, unknown>;
            };
            expect(countCall.where).toEqual(where);

            // ── Verify direction filter ──
            if (direction === 'sent') {
              expect(where.senderId).toBe(userId);
              expect(where).not.toHaveProperty('OR');
            } else if (direction === 'received') {
              expect(where.recipientId).toBe(userId);
              expect(where).not.toHaveProperty('OR');
            } else {
              // No direction: should use OR for both sent and received
              expect(where.OR).toEqual([
                { senderId: userId },
                { recipientId: userId },
              ]);
            }

            // ── Verify status filter ──
            if (status !== undefined) {
              expect(where.status).toBe(status);
            } else {
              expect(where).not.toHaveProperty('status');
            }

            // ── Verify date range filter ──
            if (dateRange.startDate || dateRange.endDate) {
              const createdAt = where.createdAt as Record<string, Date>;
              expect(createdAt).toBeDefined();

              if (dateRange.startDate) {
                expect(createdAt.gte).toEqual(new Date(dateRange.startDate));
              }
              if (dateRange.endDate) {
                expect(createdAt.lte).toEqual(new Date(dateRange.endDate));
              }
            } else {
              expect(where).not.toHaveProperty('createdAt');
            }

            return true;
          },
        ),
        { numRuns: 20 },
      );
    });
  });

  // ── Property 26 ──────────────────────────────────────────────────────

  describe('Property 26: Transaction records contain all required fields', () => {
    // Feature: stellar-pay, Property 26: Transaction records contain all required fields
    it('every returned transaction record includes all required fields', async () => {
      /**
       * Validates: Requirements 8.6
       *
       * For any set of mock transaction records returned by Prisma,
       * every record in the getTransactionHistory response should contain:
       * id, stellarTxId, senderAddress, recipientAddress, amount, memo,
       * status, createdAt, senderId, recipientId.
       */
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          fc.array(
            fc.record({
              id: fc.uuid(),
              stellarTxId: fc.option(fc.stringMatching(/^[0-9a-f]{16,64}$/), { nil: null }),
              senderAddress: stellarAddressArb,
              recipientAddress: stellarAddressArb,
              senderId: userIdArb,
              recipientId: fc.option(userIdArb, { nil: null }),
              amount: amountArb,
              memo: fc.option(fc.string({ minLength: 0, maxLength: 28 }), { nil: null }),
              status: txStatusArb,
              createdAt: fc.date({ min: new Date('2023-01-01'), max: new Date('2025-12-31') }),
            }),
            { minLength: 1, maxLength: 10 },
          ),
          async (userId, mockTransactions) => {
            jest.clearAllMocks();

            // Mock Prisma to return the generated transactions
            mockPrisma.transaction.findMany.mockResolvedValue(mockTransactions);
            mockPrisma.transaction.count.mockResolvedValue(mockTransactions.length);

            const result = await getTransactionHistory(userId);

            // Every returned record must contain all required fields
            const requiredFields = [
              'id',
              'stellarTxId',
              'senderAddress',
              'recipientAddress',
              'amount',
              'memo',
              'status',
              'createdAt',
              'senderId',
              'recipientId',
            ];

            expect(result.transactions).toHaveLength(mockTransactions.length);

            for (const tx of result.transactions) {
              for (const field of requiredFields) {
                expect(tx).toHaveProperty(field);
              }
            }

            // Verify each record's values match the mock data
            for (let i = 0; i < result.transactions.length; i++) {
              const tx = result.transactions[i];
              const mock = mockTransactions[i];

              expect(tx.id).toBe(mock.id);
              expect(tx.stellarTxId).toBe(mock.stellarTxId);
              expect(tx.senderAddress).toBe(mock.senderAddress);
              expect(tx.recipientAddress).toBe(mock.recipientAddress);
              expect(tx.amount).toBe(mock.amount);
              expect(tx.memo).toBe(mock.memo);
              expect(tx.status).toBe(mock.status);
              expect(tx.createdAt).toEqual(mock.createdAt);
              expect(tx.senderId).toBe(mock.senderId);
              expect(tx.recipientId).toBe(mock.recipientId);
            }

            return true;
          },
        ),
        { numRuns: 20 },
      );
    });
  });
});
