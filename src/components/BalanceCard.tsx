'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/Card';

/** Refresh interval for balance polling (30 seconds) */
const REFRESH_INTERVAL_MS = 30_000;

interface WalletData {
  stellarAddress: string;
  balance: string;
}

/**
 * Displays the current XLM balance fetched from /api/wallet.
 * Auto-refreshes every 30 seconds via setInterval.
 * Shows loading skeleton on initial fetch and error state on failure.
 *
 * @see Requirements 5.4 (balance refreshed within last 30 seconds),
 *      10.1 (display XLM balance on User Dashboard)
 */
export function BalanceCard() {
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchBalance = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/wallet', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to fetch balance');
      }

      const data: WalletData = await res.json();
      setWallet(data);
      setError('');
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch balance');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBalance();

    const interval = setInterval(fetchBalance, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchBalance]);

  // Loading skeleton
  if (loading && !wallet) {
    return (
      <Card className="animate-pulse">
        <div className="flex flex-col items-center gap-2 py-2">
          <div className="h-4 w-24 rounded bg-gray-200" />
          <div className="h-8 w-32 rounded bg-gray-200" />
          <div className="h-3 w-40 rounded bg-gray-200" />
        </div>
      </Card>
    );
  }

  // Error state
  if (error && !wallet) {
    return (
      <Card>
        <div className="flex flex-col items-center gap-2 py-2 text-center">
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
          <button
            onClick={fetchBalance}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
          >
            Retry
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-col items-center gap-1 py-2">
        <p className="text-sm font-medium text-gray-500">XLM Balance</p>
        <p className="text-3xl font-bold text-gray-900">
          {wallet ? parseFloat(wallet.balance).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 7,
          }) : '—'}
          <span className="ml-1 text-lg font-normal text-gray-500">XLM</span>
        </p>
        <p className="text-xs text-gray-400 truncate max-w-full" title={wallet?.stellarAddress}>
          {wallet?.stellarAddress
            ? `${wallet.stellarAddress.slice(0, 8)}...${wallet.stellarAddress.slice(-8)}`
            : ''}
        </p>
        {lastUpdated && (
          <p className="mt-1 text-xs text-gray-400">
            Updated {lastUpdated.toLocaleTimeString()}
          </p>
        )}
        {error && (
          <p className="mt-1 text-xs text-red-500">{error}</p>
        )}
      </div>
    </Card>
  );
}

BalanceCard.displayName = 'BalanceCard';
