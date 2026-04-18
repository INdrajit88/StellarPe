'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LPPositionList, LPPosition } from '@/components/LPPositionList';

/**
 * Merchant Liquidity Pool Management page.
 * Allows merchants to deposit/withdraw from pools, swap tokens,
 * and view their LP positions.
 */
export default function MerchantPoolsPage() {
  const [positions, setPositions] = useState<LPPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'swap'>('deposit');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Deposit form
  const [depositPoolId, setDepositPoolId] = useState('');
  const [amountA, setAmountA] = useState('');
  const [amountB, setAmountB] = useState('');
  const [depositPin, setDepositPin] = useState('');

  // Withdraw form
  const [withdrawPoolId, setWithdrawPoolId] = useState('');
  const [shares, setShares] = useState('');
  const [withdrawPin, setWithdrawPin] = useState('');

  // Swap form
  const [swapPoolId, setSwapPoolId] = useState('');
  const [inputToken, setInputToken] = useState('');
  const [inputAmount, setInputAmount] = useState('');
  const [minOutputAmount, setMinOutputAmount] = useState('');
  const [swapPin, setSwapPin] = useState('');

  const fetchPositions = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/pools/positions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPositions(data.positions || data || []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  async function handleDeposit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/pools/deposit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-csrf-token': 'pool-deposit',
        },
        body: JSON.stringify({
          poolContractId: depositPoolId,
          amountA,
          amountB,
          pin: depositPin,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Deposit failed.');
        return;
      }

      setSuccess(`Deposit successful! Received ${data.shares} LP shares. Tx: ${data.transactionHash}`);
      setDepositPoolId('');
      setAmountA('');
      setAmountB('');
      setDepositPin('');
      fetchPositions();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleWithdraw(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/pools/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-csrf-token': 'pool-withdraw',
        },
        body: JSON.stringify({
          poolContractId: withdrawPoolId,
          shares,
          pin: withdrawPin,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Withdrawal failed.');
        return;
      }

      setSuccess(`Withdrawal successful! Received ${data.amountA} Token A + ${data.amountB} Token B. Tx: ${data.transactionHash}`);
      setWithdrawPoolId('');
      setShares('');
      setWithdrawPin('');
      fetchPositions();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSwap(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/pools/swap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-csrf-token': 'pool-swap',
        },
        body: JSON.stringify({
          poolContractId: swapPoolId,
          inputToken,
          inputAmount,
          minOutputAmount,
          pin: swapPin,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Swap failed.');
        return;
      }

      setSuccess(`Swap successful! Output: ${data.outputAmount} (rate: ${data.effectiveRate}, fee: ${data.feeAmount}). Tx: ${data.transactionHash}`);
      setSwapPoolId('');
      setInputToken('');
      setInputAmount('');
      setMinOutputAmount('');
      setSwapPin('');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const tabs = [
    { key: 'deposit' as const, label: 'Deposit' },
    { key: 'withdraw' as const, label: 'Withdraw' },
    { key: 'swap' as const, label: 'Swap' },
  ];

  return (
    <div className="mx-auto max-w-lg px-4 py-6 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Liquidity Pools</h1>

      {/* Tab Navigation */}
      <div className="mb-6 flex rounded-lg border border-gray-200 bg-gray-50 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setError(''); setSuccess(''); }}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 break-all">
          {success}
        </div>
      )}

      {/* Deposit Form */}
      {activeTab === 'deposit' && (
        <Card className="mb-6">
          <h2 className="mb-4 text-base font-semibold text-gray-900">
            Deposit into Pool
          </h2>
          <form onSubmit={handleDeposit} className="space-y-4">
            <Input
              label="Pool Contract ID"
              placeholder="CPOOL..."
              value={depositPoolId}
              onChange={(e) => setDepositPoolId(e.target.value)}
              required
            />
            <Input
              label="Amount A"
              placeholder="Token A amount"
              value={amountA}
              onChange={(e) => setAmountA(e.target.value)}
              required
            />
            <Input
              label="Amount B"
              placeholder="Token B amount"
              value={amountB}
              onChange={(e) => setAmountB(e.target.value)}
              required
            />
            <Input
              label="PIN"
              type="password"
              placeholder="Enter your PIN"
              value={depositPin}
              onChange={(e) => setDepositPin(e.target.value)}
              required
              maxLength={6}
            />
            <Button type="submit" loading={submitting} className="w-full">
              Deposit
            </Button>
          </form>
        </Card>
      )}

      {/* Withdraw Form */}
      {activeTab === 'withdraw' && (
        <Card className="mb-6">
          <h2 className="mb-4 text-base font-semibold text-gray-900">
            Withdraw from Pool
          </h2>
          <form onSubmit={handleWithdraw} className="space-y-4">
            <Input
              label="Pool Contract ID"
              placeholder="CPOOL..."
              value={withdrawPoolId}
              onChange={(e) => setWithdrawPoolId(e.target.value)}
              required
            />
            <Input
              label="Shares to Burn"
              placeholder="LP share amount"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              required
            />
            <Input
              label="PIN"
              type="password"
              placeholder="Enter your PIN"
              value={withdrawPin}
              onChange={(e) => setWithdrawPin(e.target.value)}
              required
              maxLength={6}
            />
            <Button type="submit" loading={submitting} className="w-full">
              Withdraw
            </Button>
          </form>
        </Card>
      )}

      {/* Swap Form */}
      {activeTab === 'swap' && (
        <Card className="mb-6">
          <h2 className="mb-4 text-base font-semibold text-gray-900">
            Swap Tokens
          </h2>
          <form onSubmit={handleSwap} className="space-y-4">
            <Input
              label="Pool Contract ID"
              placeholder="CPOOL..."
              value={swapPoolId}
              onChange={(e) => setSwapPoolId(e.target.value)}
              required
            />
            <Input
              label="Input Token Contract ID"
              placeholder="CTOKEN..."
              value={inputToken}
              onChange={(e) => setInputToken(e.target.value)}
              required
            />
            <Input
              label="Input Amount"
              placeholder="Amount to swap"
              value={inputAmount}
              onChange={(e) => setInputAmount(e.target.value)}
              required
            />
            <Input
              label="Minimum Output Amount"
              placeholder="Slippage protection"
              value={minOutputAmount}
              onChange={(e) => setMinOutputAmount(e.target.value)}
              required
            />
            <Input
              label="PIN"
              type="password"
              placeholder="Enter your PIN"
              value={swapPin}
              onChange={(e) => setSwapPin(e.target.value)}
              required
              maxLength={6}
            />
            <Button type="submit" loading={submitting} className="w-full">
              Swap
            </Button>
          </form>
        </Card>
      )}

      {/* LP Positions */}
      <Card>
        <h2 className="mb-3 text-base font-semibold text-gray-900">
          Your LP Positions
        </h2>
        {loading ? (
          <div className="space-y-3 py-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex animate-pulse items-center justify-between">
                <div className="space-y-2">
                  <div className="h-3 w-28 rounded bg-gray-200" />
                  <div className="h-3 w-20 rounded bg-gray-200" />
                </div>
                <div className="h-4 w-24 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        ) : (
          <LPPositionList positions={positions} />
        )}
      </Card>
    </div>
  );
}
