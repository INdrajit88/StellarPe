'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BalanceCard } from '@/components/BalanceCard';
import { TransactionList, Transaction } from '@/components/TransactionList';
import { Card } from '@/components/ui/Card';

/**
 * User Dashboard page.
 * Displays XLM balance (BalanceCard), 5 most recent transactions,
 * and quick-pay action buttons (Send, Scan QR, Pay by Username).
 * Includes an SSE listener for real-time payment notifications.
 *
 * Responsive: 320px to 1440px without horizontal scrolling.
 *
 * @see Requirements 10.1 (dashboard content), 10.2 (responsive),
 *      10.4 (Send quick-pay), 10.5 (Scan QR action)
 */
export default function UserDashboardPage() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchRecentTransactions = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/payments/history?page=1', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        // Show only the 5 most recent
        setTransactions((data.transactions || []).slice(0, 5));
      }
    } catch {
      // Silently fail — transactions are supplementary
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Get user ID from localStorage
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setUserId(user.id || '');
      } catch {
        // ignore
      }
    }

    fetchRecentTransactions();
  }, [fetchRecentTransactions]);

  // SSE listener for real-time payment notifications
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const eventSource = new EventSource(`/api/events/stream?token=${encodeURIComponent(token)}`);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('payment_received', () => {
      // Refresh transactions when a new payment is received
      fetchRecentTransactions();
    });

    eventSource.addEventListener('connected', () => {
      // SSE connection established
    });

    eventSource.onerror = () => {
      // SSE will auto-reconnect
    };

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  }, [fetchRecentTransactions]);

  return (
    <div className="mx-auto max-w-lg px-4 py-6 sm:px-6">
      {/* Header */}
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* Balance Card */}
      <BalanceCard />

      {/* Quick-pay actions */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        <QuickAction
          label="Send"
          icon={<SendIcon />}
          onClick={() => router.push('/user/send')}
        />
        <QuickAction
          label="Scan QR"
          icon={<QRIcon />}
          onClick={() => router.push('/user/scan')}
        />
        <QuickAction
          label="Pay User"
          icon={<UserIcon />}
          onClick={() => router.push('/user/send?mode=username')}
        />
      </div>

      {/* Recent Transactions */}
      <Card className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">
            Recent Transactions
          </h2>
          <Link
            href="/user/history"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
          >
            View all
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3 py-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex animate-pulse items-center justify-between">
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
            emptyMessage="No transactions yet. Send your first payment!"
          />
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Quick Action Button                                                */
/* ------------------------------------------------------------------ */

function QuickAction({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:bg-gray-50 active:bg-gray-100"
    >
      <span className="text-indigo-600">{icon}</span>
      <span className="text-xs font-medium text-gray-700">{label}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Icon components                                                    */
/* ------------------------------------------------------------------ */

function SendIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
    </svg>
  );
}

function QRIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm14 3h.01M17 17h.01M14 14h3v3h-3v-3zm3 3h3v3h-3v-3z" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}
