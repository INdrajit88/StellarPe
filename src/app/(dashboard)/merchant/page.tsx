'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { BalanceCard } from '@/components/BalanceCard';
import { TransactionList, Transaction } from '@/components/TransactionList';
import { QRCodeDisplay } from '@/components/QRCodeDisplay';
import { Card } from '@/components/ui/Card';
import { TokenBalanceList, TokenBalance } from '@/components/TokenBalanceList';
import { LPPositionList, LPPosition } from '@/components/LPPositionList';

/**
 * Merchant Dashboard page.
 * Displays the merchant's static QR code, total lifetime earnings,
 * today's transaction count, and the 10 most recent inbound transactions.
 * Includes an SSE listener for real-time payment notifications.
 *
 * @see Requirements 11.1 (merchant dashboard content)
 */
export default function MerchantDashboardPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [userId, setUserId] = useState('');
  const [stellarAddress, setStellarAddress] = useState('');
  const [loading, setLoading] = useState(true);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Token balances state (Requirement 10.1)
  const [tokenBalances, setTokenBalances] = useState<TokenBalance[]>([]);
  const [tokenBalancesLoading, setTokenBalancesLoading] = useState(true);
  const tokenBalancesFetchedAtRef = useRef<number>(0);

  // LP positions state (Requirement 10.2)
  const [lpPositions, setLpPositions] = useState<LPPosition[]>([]);
  const [lpPositionsLoading, setLpPositionsLoading] = useState(true);
  const lpPositionsFetchedAtRef = useRef<number>(0);

  const fetchWallet = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/wallet', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStellarAddress(data.stellarAddress || '');
      }
    } catch {
      // Silently fail — QR display is supplementary
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      // Fetch a larger set to compute stats, then slice for display
      const res = await fetch('/api/payments/history?page=1', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        const allTx: Transaction[] = data.transactions || [];

        // Calculate total lifetime earnings (received transactions)
        const userStr = localStorage.getItem('user');
        let uid = '';
        if (userStr) {
          try {
            uid = JSON.parse(userStr).id || '';
          } catch {
            // ignore
          }
        }

        // Compute total earnings from received completed transactions
        let earnings = 0;
        let todayTxCount = 0;
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        for (const tx of allTx) {
          if (tx.recipientId === uid && tx.status === 'COMPLETED') {
            earnings += parseFloat(tx.amount);
          }
          const txDate = new Date(tx.createdAt);
          if (txDate >= todayStart) {
            todayTxCount++;
          }
        }

        setTotalEarnings(earnings);
        setTodayCount(todayTxCount);
        // Show only the 10 most recent
        setTransactions(allTx.slice(0, 10));
      }
    } catch {
      // Silently fail — transactions are supplementary
    } finally {
      setLoading(false);
    }
  }, []);

  /** Fetch token balances with 60-second staleness window (Requirement 10.4) */
  const fetchTokenBalances = useCallback(async () => {
    const now = Date.now();
    if (now - tokenBalancesFetchedAtRef.current < 60_000) return;

    setTokenBalancesLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/tokens/balances', {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setTokenBalances(data.balances || data || []);
        tokenBalancesFetchedAtRef.current = Date.now();
      }
    } catch {
      // Show empty state on error
      setTokenBalances([]);
    } finally {
      setTokenBalancesLoading(false);
    }
  }, []);

  /** Fetch LP positions with 60-second staleness window (Requirement 10.4) */
  const fetchLpPositions = useCallback(async () => {
    const now = Date.now();
    if (now - lpPositionsFetchedAtRef.current < 60_000) return;

    setLpPositionsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/pools/positions', {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setLpPositions(data.positions || data || []);
        lpPositionsFetchedAtRef.current = Date.now();
      }
    } catch {
      // Show empty state on error
      setLpPositions([]);
    } finally {
      setLpPositionsLoading(false);
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

    fetchWallet();
    fetchTransactions();
    fetchTokenBalances();
    fetchLpPositions();
  }, [fetchWallet, fetchTransactions, fetchTokenBalances, fetchLpPositions]);

  // SSE listener for real-time payment notifications
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    const eventSource = new EventSource(
      `/api/events/stream?token=${encodeURIComponent(token)}`,
    );
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('payment_received', () => {
      // Refresh transactions and stats when a new payment is received
      fetchTransactions();
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
  }, [fetchTransactions]);

  return (
    <div className="mx-auto max-w-lg px-4 py-6 sm:px-6">
      {/* Header */}
      <h1 className="mb-6 text-2xl font-bold text-gray-900">
        Merchant Dashboard
      </h1>

      {/* Balance Card */}
      <BalanceCard />

      {/* Static QR Code */}
      <Card className="mt-6">
        <div className="flex flex-col items-center gap-3">
          <h2 className="text-base font-semibold text-gray-900">
            Your Payment QR Code
          </h2>
          <QRCodeDisplay value={stellarAddress} size={200} />
          {stellarAddress && (
            <p
              className="max-w-full truncate text-xs text-gray-400"
              title={stellarAddress}
            >
              {stellarAddress.slice(0, 12)}...{stellarAddress.slice(-12)}
            </p>
          )}
        </div>
      </Card>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <Card>
          <div className="flex flex-col items-center gap-1 py-1">
            <p className="text-sm font-medium text-gray-500">
              Lifetime Earnings
            </p>
            <p className="text-xl font-bold text-gray-900">
              {totalEarnings.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 7,
              })}
              <span className="ml-1 text-sm font-normal text-gray-500">
                XLM
              </span>
            </p>
          </div>
        </Card>
        <Card>
          <div className="flex flex-col items-center gap-1 py-1">
            <p className="text-sm font-medium text-gray-500">
              Today&apos;s Transactions
            </p>
            <p className="text-xl font-bold text-gray-900">{todayCount}</p>
          </div>
        </Card>
      </div>

      {/* Custom Tokens (Requirement 10.1) */}
      <Card className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            Custom Tokens
          </h2>
          <Link
            href="/merchant/tokens"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
          >
            Manage
          </Link>
        </div>
        {tokenBalancesLoading ? (
          <div className="space-y-3 py-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex animate-pulse items-center justify-between"
              >
                <div className="space-y-2">
                  <div className="h-3 w-24 rounded bg-gray-200" />
                  <div className="h-3 w-16 rounded bg-gray-200" />
                </div>
                <div className="h-4 w-20 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        ) : (
          <TokenBalanceList balances={tokenBalances} />
        )}
      </Card>

      {/* LP Positions (Requirement 10.2) */}
      <Card className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            Liquidity Pool Positions
          </h2>
          <Link
            href="/merchant/pools"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
          >
            Manage
          </Link>
        </div>
        {lpPositionsLoading ? (
          <div className="space-y-3 py-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex animate-pulse items-center justify-between"
              >
                <div className="space-y-2">
                  <div className="h-3 w-28 rounded bg-gray-200" />
                  <div className="h-3 w-20 rounded bg-gray-200" />
                </div>
                <div className="h-4 w-24 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        ) : (
          <LPPositionList positions={lpPositions} />
        )}
      </Card>

      {/* Recent Transactions */}
      <Card className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            Recent Transactions
          </h2>
          <Link
            href="/merchant/transactions"
            className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
          >
            View all
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3 py-2">
            {[1, 2, 3].map((i) => (
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
            emptyMessage="No transactions yet. Share your QR code to receive payments!"
          />
        )}
      </Card>
    </div>
  );
}
