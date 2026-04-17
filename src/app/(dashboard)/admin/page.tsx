'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/Card';

/**
 * Admin Dashboard stats shape returned by GET /api/admin/dashboard.
 */
interface DashboardStats {
  userCount: number;
  merchantCount: number;
  txCount: number;
  volume: string;
  failedLast24h: number;
}

/**
 * Admin Dashboard page.
 * Displays platform-level statistics: total registered User count,
 * total registered Merchant count, total Transaction count,
 * total XLM volume transacted, and failed transactions in the last 24 hours.
 *
 * Mobile-first responsive layout using Tailwind CSS.
 *
 * @see Requirements 12.1 (admin dashboard stats)
 */
export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchStats = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/admin/dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to load dashboard stats.');
        return;
      }

      const data: DashboardStats = await res.json();
      setStats(data);
    } catch {
      setError('Failed to load dashboard stats.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">
          Admin Dashboard
        </h1>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i}>
              <div className="flex animate-pulse flex-col items-center gap-2 py-4">
                <div className="h-4 w-24 rounded bg-gray-200" />
                <div className="h-8 w-16 rounded bg-gray-200" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">
          Admin Dashboard
        </h1>
        <Card>
          <div className="flex flex-col items-center gap-3 py-6">
            <ErrorIcon />
            <p className="text-sm text-red-600">{error}</p>
            <button
              onClick={() => {
                setError('');
                setLoading(true);
                fetchStats();
              }}
              className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
            >
              Try again
            </button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      {/* Header */}
      <h1 className="mb-6 text-2xl font-bold text-gray-900">
        Admin Dashboard
      </h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Total Users"
          value={stats?.userCount ?? 0}
          icon={<UsersIcon />}
        />
        <StatCard
          label="Total Merchants"
          value={stats?.merchantCount ?? 0}
          icon={<MerchantIcon />}
        />
        <StatCard
          label="Total Transactions"
          value={stats?.txCount ?? 0}
          icon={<TransactionIcon />}
        />
        <StatCard
          label="Total XLM Volume"
          value={formatVolume(stats?.volume ?? '0')}
          suffix="XLM"
          icon={<VolumeIcon />}
        />
        <StatCard
          label="Failed (24h)"
          value={stats?.failedLast24h ?? 0}
          icon={<AlertIcon />}
          highlight={
            (stats?.failedLast24h ?? 0) > 0 ? 'text-red-600' : undefined
          }
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat Card                                                          */
/* ------------------------------------------------------------------ */

function StatCard({
  label,
  value,
  suffix,
  icon,
  highlight,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  icon: React.ReactNode;
  highlight?: string;
}) {
  return (
    <Card>
      <div className="flex items-center gap-4 py-2">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p
            className={`text-xl font-bold ${highlight ?? 'text-gray-900'}`}
          >
            {typeof value === 'number' ? value.toLocaleString() : value}
            {suffix && (
              <span className="ml-1 text-sm font-normal text-gray-500">
                {suffix}
              </span>
            )}
          </p>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Formats the XLM volume string for display.
 * Shows up to 2 decimal places for readability.
 */
function formatVolume(volume: string): string {
  const num = parseFloat(volume);
  if (isNaN(num)) return '0';
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/* ------------------------------------------------------------------ */
/*  Icon components                                                    */
/* ------------------------------------------------------------------ */

function UsersIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

function MerchantIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}

function TransactionIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
    </svg>
  );
}

function VolumeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
