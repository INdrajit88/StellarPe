'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { TokenBalanceList, TokenBalance } from '@/components/TokenBalanceList';

/**
 * Merchant Token Management page.
 * Allows merchants to create new SEP-41 tokens and view their token balances.
 */
export default function MerchantTokensPage() {
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [decimals, setDecimals] = useState('7');
  const [initialSupply, setInitialSupply] = useState('');

  const fetchBalances = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/tokens/balances', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setBalances(data.balances || data || []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setCreating(true);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/tokens/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-csrf-token': 'token-create',
        },
        body: JSON.stringify({
          name,
          symbol: symbol.toUpperCase(),
          decimals: parseInt(decimals, 10),
          initialSupply,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create token.');
        return;
      }

      setSuccess(`Token created! Contract ID: ${data.contractId}`);
      setName('');
      setSymbol('');
      setDecimals('7');
      setInitialSupply('');
      fetchBalances();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Custom Tokens</h1>

      {/* Create Token Form */}
      <Card className="mb-6">
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          Create New Token
        </h2>

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

        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Token Name"
            placeholder="e.g. StellarCoin"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={32}
          />

          <Input
            label="Symbol"
            placeholder="e.g. STC"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            required
            maxLength={12}
          />

          <Input
            label="Decimals (0-18)"
            type="number"
            placeholder="7"
            value={decimals}
            onChange={(e) => setDecimals(e.target.value)}
            required
            min={0}
            max={18}
          />

          <Input
            label="Initial Supply"
            placeholder="e.g. 1000000000"
            value={initialSupply}
            onChange={(e) => setInitialSupply(e.target.value)}
            required
          />

          <Button type="submit" loading={creating} className="w-full">
            Create Token
          </Button>
        </form>
      </Card>

      {/* Token Balances */}
      <Card>
        <h2 className="mb-3 text-base font-semibold text-gray-900">
          Your Tokens
        </h2>
        {loading ? (
          <div className="space-y-3 py-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex animate-pulse items-center justify-between">
                <div className="space-y-2">
                  <div className="h-3 w-24 rounded bg-gray-200" />
                  <div className="h-3 w-16 rounded bg-gray-200" />
                </div>
                <div className="h-4 w-20 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        ) : (
          <TokenBalanceList balances={balances} />
        )}
      </Card>
    </div>
  );
}
