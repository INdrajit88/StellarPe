'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Transaction } from '@/components/TransactionList';
import { Card } from '@/components/ui/Card';
import { aggregateAnalytics, formatShortDate } from '@/lib/utils/analytics';

/**
 * Merchant Analytics page.
 * Displays daily transaction volume (XLM), transaction count per day,
 * and total earnings over the last 30 days.
 * Uses simple bar charts built with Tailwind CSS (no external chart library).
 *
 * Charts render within 3 seconds for up to 10,000 transactions.
 *
 * @see Requirements 11.4 (analytics content), 11.5 (render within 3 seconds)
 */
export default function MerchantAnalyticsPage() {
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAllTransactions = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const transactions: Transaction[] = [];
      let page = 1;
      let hasMore = true;

      // Fetch all pages to aggregate analytics
      while (hasMore) {
        const res = await fetch(`/api/payments/history?page=${page}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || 'Failed to load analytics data.');
          break;
        }

        const data = await res.json();
        const pageTx: Transaction[] = data.transactions || [];
        transactions.push(...pageTx);

        const pagination = data.pagination;
        if (!pagination || page >= pagination.totalPages) {
          hasMore = false;
        } else {
          page++;
        }
      }

      setAllTransactions(transactions);
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setUserId(user.id || '');
      } catch {
        // ignore
      }
    }

    fetchAllTransactions();
  }, [fetchAllTransactions]);

  // Aggregate data by day for the last 30 days using extracted utility
  const { dailyData, totalEarnings30d } = useMemo(
    () => aggregateAnalytics(allTransactions, userId),
    [allTransactions, userId],
  );

  const maxVolume = useMemo(
    () => Math.max(...dailyData.map((d) => d.volume), 1),
    [dailyData],
  );

  const maxCount = useMemo(
    () => Math.max(...dailyData.map((d) => d.count), 1),
    [dailyData],
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-6 sm:px-6">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Analytics</h1>
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Analytics</h1>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {/* Total Earnings (30 days) */}
      <Card className="mb-6">
        <div className="flex flex-col items-center gap-1 py-2">
          <p className="text-sm font-medium text-gray-500">
            Total Earnings (Last 30 Days)
          </p>
          <p className="text-3xl font-bold text-gray-900">
            {totalEarnings30d.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 7,
            })}
            <span className="ml-1 text-lg font-normal text-gray-500">XLM</span>
          </p>
        </div>
      </Card>

      {/* Daily Transaction Volume Chart */}
      <Card className="mb-6">
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          Daily Transaction Volume (XLM)
        </h2>
        <div
          className="flex items-end gap-0.5"
          style={{ height: 160 }}
          role="img"
          aria-label="Bar chart showing daily transaction volume in XLM over the last 30 days"
        >
          {dailyData.map((day) => {
            const heightPercent =
              maxVolume > 0 ? (day.volume / maxVolume) * 100 : 0;
            return (
              <div
                key={day.date}
                className="group relative flex-1"
                style={{ height: '100%' }}
              >
                <div
                  className="absolute bottom-0 left-0 right-0 flex items-end justify-center"
                  style={{ height: '100%' }}
                >
                  <div
                    className="w-full rounded-t bg-indigo-500 transition-all hover:bg-indigo-600"
                    style={{
                      height: `${Math.max(heightPercent, day.volume > 0 ? 2 : 0)}%`,
                      minHeight: day.volume > 0 ? '2px' : '0px',
                    }}
                  />
                </div>
                {/* Tooltip */}
                <div className="pointer-events-none absolute -top-14 left-1/2 z-10 hidden -translate-x-1/2 rounded bg-gray-800 px-2 py-1 text-xs text-white shadow-lg group-hover:block">
                  <p className="whitespace-nowrap font-medium">
                    {day.volume.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{' '}
                    XLM
                  </p>
                  <p className="whitespace-nowrap text-gray-300">
                    {formatShortDate(day.date)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between text-xs text-gray-400">
          <span>
            {dailyData.length > 0 ? formatShortDate(dailyData[0].date) : ''}
          </span>
          <span>
            {dailyData.length > 0
              ? formatShortDate(dailyData[dailyData.length - 1].date)
              : ''}
          </span>
        </div>
      </Card>

      {/* Daily Transaction Count Chart */}
      <Card>
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          Daily Transaction Count
        </h2>
        <div
          className="flex items-end gap-0.5"
          style={{ height: 160 }}
          role="img"
          aria-label="Bar chart showing daily transaction count over the last 30 days"
        >
          {dailyData.map((day) => {
            const heightPercent =
              maxCount > 0 ? (day.count / maxCount) * 100 : 0;
            return (
              <div
                key={day.date}
                className="group relative flex-1"
                style={{ height: '100%' }}
              >
                <div
                  className="absolute bottom-0 left-0 right-0 flex items-end justify-center"
                  style={{ height: '100%' }}
                >
                  <div
                    className="w-full rounded-t bg-green-500 transition-all hover:bg-green-600"
                    style={{
                      height: `${Math.max(heightPercent, day.count > 0 ? 2 : 0)}%`,
                      minHeight: day.count > 0 ? '2px' : '0px',
                    }}
                  />
                </div>
                {/* Tooltip */}
                <div className="pointer-events-none absolute -top-14 left-1/2 z-10 hidden -translate-x-1/2 rounded bg-gray-800 px-2 py-1 text-xs text-white shadow-lg group-hover:block">
                  <p className="whitespace-nowrap font-medium">
                    {day.count} tx{day.count !== 1 ? 's' : ''}
                  </p>
                  <p className="whitespace-nowrap text-gray-300">
                    {formatShortDate(day.date)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between text-xs text-gray-400">
          <span>
            {dailyData.length > 0 ? formatShortDate(dailyData[0].date) : ''}
          </span>
          <span>
            {dailyData.length > 0
              ? formatShortDate(dailyData[dailyData.length - 1].date)
              : ''}
          </span>
        </div>
      </Card>
    </div>
  );
}
