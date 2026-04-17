import { aggregateAnalytics, formatShortDate } from '../analytics';
import { Transaction } from '@/components/TransactionList';

/**
 * Unit tests for the merchant analytics aggregation logic.
 *
 * @see Requirements 11.4 (daily volume, count, total earnings over 30 days)
 * @see Requirements 11.5 (render within 3 seconds for up to 10,000 transactions)
 */

const MERCHANT_ID = 'merchant-001';

/** Helper to create a transaction for testing */
function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: overrides.id ?? 'tx-1',
    stellarTxId: overrides.stellarTxId ?? 'stellar-tx-1',
    senderAddress: overrides.senderAddress ?? 'GABCDEF',
    recipientAddress: overrides.recipientAddress ?? 'GXYZ123',
    senderId: overrides.senderId ?? 'user-001',
    recipientId: overrides.recipientId ?? MERCHANT_ID,
    amount: overrides.amount ?? '100.0000000',
    memo: overrides.memo ?? null,
    status: overrides.status ?? 'COMPLETED',
    createdAt: overrides.createdAt ?? new Date().toISOString(),
  };
}

describe('aggregateAnalytics', () => {
  const referenceDate = new Date('2025-01-30T12:00:00Z');

  it('returns 30 days of data with zero values when no transactions', () => {
    const result = aggregateAnalytics([], MERCHANT_ID, referenceDate);

    expect(result.dailyData).toHaveLength(30);
    expect(result.totalEarnings30d).toBe(0);
    result.dailyData.forEach((day) => {
      expect(day.volume).toBe(0);
      expect(day.count).toBe(0);
    });
  });

  it('returns daily data sorted chronologically', () => {
    const result = aggregateAnalytics([], MERCHANT_ID, referenceDate);

    for (let i = 1; i < result.dailyData.length; i++) {
      expect(result.dailyData[i].date > result.dailyData[i - 1].date).toBe(true);
    }
  });

  it('aggregates received COMPLETED transactions into correct day buckets', () => {
    const transactions: Transaction[] = [
      makeTx({
        id: 'tx-1',
        amount: '50.0000000',
        createdAt: '2025-01-28T10:00:00Z',
        recipientId: MERCHANT_ID,
      }),
      makeTx({
        id: 'tx-2',
        amount: '30.0000000',
        createdAt: '2025-01-28T15:00:00Z',
        recipientId: MERCHANT_ID,
      }),
      makeTx({
        id: 'tx-3',
        amount: '20.0000000',
        createdAt: '2025-01-29T08:00:00Z',
        recipientId: MERCHANT_ID,
      }),
    ];

    const result = aggregateAnalytics(transactions, MERCHANT_ID, referenceDate);

    // Find the day entries for Jan 28 and Jan 29
    const jan28 = result.dailyData.find((d) => d.date === '2025-01-28');
    const jan29 = result.dailyData.find((d) => d.date === '2025-01-29');

    expect(jan28).toBeDefined();
    expect(jan28!.volume).toBeCloseTo(80, 5);
    expect(jan28!.count).toBe(2);

    expect(jan29).toBeDefined();
    expect(jan29!.volume).toBeCloseTo(20, 5);
    expect(jan29!.count).toBe(1);

    expect(result.totalEarnings30d).toBeCloseTo(100, 5);
  });

  it('excludes FAILED transactions from earnings', () => {
    const transactions: Transaction[] = [
      makeTx({
        id: 'tx-1',
        amount: '100.0000000',
        status: 'COMPLETED',
        createdAt: '2025-01-28T10:00:00Z',
      }),
      makeTx({
        id: 'tx-2',
        amount: '50.0000000',
        status: 'FAILED',
        createdAt: '2025-01-28T11:00:00Z',
      }),
    ];

    const result = aggregateAnalytics(transactions, MERCHANT_ID, referenceDate);

    expect(result.totalEarnings30d).toBeCloseTo(100, 5);
  });

  it('excludes sent transactions (where merchant is sender, not recipient)', () => {
    const transactions: Transaction[] = [
      makeTx({
        id: 'tx-1',
        amount: '100.0000000',
        senderId: MERCHANT_ID,
        recipientId: 'user-002',
        createdAt: '2025-01-28T10:00:00Z',
      }),
      makeTx({
        id: 'tx-2',
        amount: '50.0000000',
        senderId: 'user-002',
        recipientId: MERCHANT_ID,
        createdAt: '2025-01-28T11:00:00Z',
      }),
    ];

    const result = aggregateAnalytics(transactions, MERCHANT_ID, referenceDate);

    // Only the received transaction should count
    expect(result.totalEarnings30d).toBeCloseTo(50, 5);
    const jan28 = result.dailyData.find((d) => d.date === '2025-01-28');
    expect(jan28!.count).toBe(1);
  });

  it('excludes transactions older than 30 days', () => {
    const transactions: Transaction[] = [
      makeTx({
        id: 'tx-old',
        amount: '500.0000000',
        createdAt: '2024-12-20T10:00:00Z', // More than 30 days before Jan 30
      }),
      makeTx({
        id: 'tx-recent',
        amount: '100.0000000',
        createdAt: '2025-01-25T10:00:00Z',
      }),
    ];

    const result = aggregateAnalytics(transactions, MERCHANT_ID, referenceDate);

    expect(result.totalEarnings30d).toBeCloseTo(100, 5);
  });

  it('handles transactions with decimal amounts correctly', () => {
    const transactions: Transaction[] = [
      makeTx({
        id: 'tx-1',
        amount: '0.1234567',
        createdAt: '2025-01-28T10:00:00Z',
      }),
      makeTx({
        id: 'tx-2',
        amount: '0.8765433',
        createdAt: '2025-01-28T11:00:00Z',
      }),
    ];

    const result = aggregateAnalytics(transactions, MERCHANT_ID, referenceDate);

    expect(result.totalEarnings30d).toBeCloseTo(1.0, 5);
  });

  it('processes 10,000 transactions within 3 seconds', () => {
    // Generate 10,000 transactions spread across the last 29 days (within the 30-day window)
    const transactions: Transaction[] = [];
    for (let i = 0; i < 10000; i++) {
      const daysAgo = i % 29; // 0-28 days ago, all within the 30-day pre-filled window
      const txDate = new Date(referenceDate);
      txDate.setDate(txDate.getDate() - daysAgo);
      txDate.setHours(Math.floor(Math.random() * 24));

      transactions.push(
        makeTx({
          id: `tx-${i}`,
          amount: `${(Math.random() * 100).toFixed(7)}`,
          createdAt: txDate.toISOString(),
          recipientId: MERCHANT_ID,
        }),
      );
    }

    const start = performance.now();
    const result = aggregateAnalytics(transactions, MERCHANT_ID, referenceDate);
    const elapsed = performance.now() - start;

    // Must complete within 3 seconds (requirement 11.5)
    expect(elapsed).toBeLessThan(3000);
    expect(result.dailyData).toHaveLength(30);
    expect(result.totalEarnings30d).toBeGreaterThan(0);
  });
});

describe('formatShortDate', () => {
  it('formats a date string to short display format', () => {
    const result = formatShortDate('2025-01-15');
    // Should contain "Jan" and "15" in some locale-appropriate format
    expect(result).toContain('Jan');
    expect(result).toContain('15');
  });

  it('formats different months correctly', () => {
    const result = formatShortDate('2025-06-01');
    expect(result).toContain('Jun');
    expect(result).toContain('1');
  });
});
