import { Transaction } from '@/components/TransactionList';

export interface DailyData {
  date: string;
  volume: number;
  count: number;
}

export interface AnalyticsResult {
  dailyData: DailyData[];
  totalEarnings30d: number;
}

/**
 * Aggregates transaction data into daily buckets for the last 30 days.
 * Only counts COMPLETED transactions where the merchant is the recipient.
 *
 * Performance: O(n) single pass over transactions with a pre-filled day map.
 * Designed to handle up to 10,000 transactions within 3 seconds.
 *
 * @param transactions - All transactions to aggregate
 * @param userId - The merchant's user ID (to filter received transactions)
 * @param now - Optional reference date (defaults to current date, useful for testing)
 * @returns Daily aggregated data and total earnings over 30 days
 *
 * @see Requirements 11.4 (daily volume, count, total earnings over 30 days)
 * @see Requirements 11.5 (render within 3 seconds for up to 10,000 transactions)
 */
export function aggregateAnalytics(
  transactions: Transaction[],
  userId: string,
  now: Date = new Date(),
): AnalyticsResult {
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  // Build a map of date -> { volume, count }, pre-filled with all 30 days
  const dayMap = new Map<string, { volume: number; count: number }>();

  for (let i = 0; i < 30; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - (29 - i));
    const key = d.toISOString().split('T')[0];
    dayMap.set(key, { volume: 0, count: 0 });
  }

  let total = 0;

  for (const tx of transactions) {
    // Skip non-completed transactions
    if (tx.status !== 'COMPLETED') continue;
    // Only count received transactions for merchant earnings
    if (tx.recipientId !== userId) continue;

    const txDate = new Date(tx.createdAt);
    if (txDate < thirtyDaysAgo) continue;

    const key = txDate.toISOString().split('T')[0];
    const existing = dayMap.get(key);
    const amt = parseFloat(tx.amount);

    if (existing) {
      existing.volume += amt;
      existing.count += 1;
    } else {
      dayMap.set(key, { volume: amt, count: 1 });
    }

    total += amt;
  }

  // Convert to sorted array
  const dailyData: DailyData[] = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => ({
      date,
      volume: data.volume,
      count: data.count,
    }));

  return { dailyData, totalEarnings30d: total };
}

/**
 * Format a date string (YYYY-MM-DD) to a short display format (e.g. "Jan 5").
 */
export function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
