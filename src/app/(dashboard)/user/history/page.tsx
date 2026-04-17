'use client';

import { useState, useEffect, useCallback } from 'react';
import { TransactionList, Transaction } from '@/components/TransactionList';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

/** Number of transactions per page */
const PAGE_SIZE = 20;

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * Transaction History page.
 * Paginated transaction list (20/page) with filters for date range,
 * direction (sent/received), and status (completed/failed).
 * Displays all required transaction fields via the TransactionList component.
 *
 * @see Requirements 8.1–8.7
 */
export default function HistoryPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filter state
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [direction, setDirection] = useState<'' | 'sent' | 'received'>('');
  const [status, setStatus] = useState<'' | 'completed' | 'failed'>('');
  const [page, setPage] = useState(1);

  const fetchHistory = useCallback(
    async (pageNum: number) => {
      setLoading(true);
      setError('');

      try {
        const token = localStorage.getItem('token');
        const params = new URLSearchParams();
        params.set('page', String(pageNum));
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);
        if (direction) params.set('direction', direction);
        if (status) params.set('status', status);

        const res = await fetch(`/api/payments/history?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          const data = await res.json();
          setTransactions(data.transactions || []);
          setPagination(data.pagination || null);
        } else {
          const data = await res.json().catch(() => ({}));
          setError(data.error || 'Failed to load transaction history.');
        }
      } catch {
        setError('Network error. Please check your connection.');
      } finally {
        setLoading(false);
      }
    },
    [startDate, endDate, direction, status],
  );

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
  }, []);

  useEffect(() => {
    fetchHistory(page);
  }, [page, fetchHistory]);

  function handleApplyFilters() {
    setPage(1);
    fetchHistory(1);
  }

  function handleClearFilters() {
    setStartDate('');
    setEndDate('');
    setDirection('');
    setStatus('');
    setPage(1);
  }

  const totalPages = pagination?.totalPages || 1;

  return (
    <div className="mx-auto max-w-lg px-4 py-6 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">
        Transaction History
      </h1>

      {/* Filters */}
      <Card className="mb-4">
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700">Filters</p>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Start Date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <Input
              label="End Date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="filter-direction"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Direction
              </label>
              <select
                id="filter-direction"
                value={direction}
                onChange={(e) =>
                  setDirection(e.target.value as '' | 'sent' | 'received')
                }
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All</option>
                <option value="sent">Sent</option>
                <option value="received">Received</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="filter-status"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Status
              </label>
              <select
                id="filter-status"
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as '' | 'completed' | 'failed')
                }
                className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              size="sm"
              className="flex-1"
              onClick={handleApplyFilters}
            >
              Apply
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={handleClearFilters}
            >
              Clear
            </Button>
          </div>
        </div>
      </Card>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {/* Transaction List */}
      <Card>
        {loading ? (
          <div className="space-y-3 py-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="flex animate-pulse items-center justify-between"
              >
                <div className="space-y-2">
                  <div className="h-3 w-20 rounded bg-gray-200" />
                  <div className="h-3 w-32 rounded bg-gray-200" />
                </div>
                <div className="h-4 w-16 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        ) : (
          <TransactionList
            transactions={transactions}
            currentUserId={userId}
            emptyMessage="No transactions match your filters."
          />
        )}
      </Card>

      {/* Pagination Controls */}
      {!loading && pagination && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>

          <span className="text-sm text-gray-500">
            Page {page} of {totalPages}
          </span>

          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      {/* Total count */}
      {!loading && pagination && (
        <p className="mt-2 text-center text-xs text-gray-400">
          {pagination.total} transaction{pagination.total !== 1 ? 's' : ''} total
        </p>
      )}
    </div>
  );
}
