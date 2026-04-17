'use client';

import { useState, useEffect, useCallback } from 'react';
import { QRCodeDisplay } from '@/components/QRCodeDisplay';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

/** CSRF token generator for state-mutating requests */
function generateCsrfToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Merchant QR Management page.
 * Allows merchants to view their static QR code and generate
 * dynamic QR codes with a specific amount and optional description.
 *
 * @see Requirements 7.1 (static QR), 7.2 (dynamic QR), 11.2 (generate dynamic QR action)
 */
export default function MerchantQRPage() {
  const [stellarAddress, setStellarAddress] = useState('');
  const [walletLoading, setWalletLoading] = useState(true);

  // Dynamic QR form state
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [dynamicQRData, setDynamicQRData] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

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
      // Silently fail
    } finally {
      setWalletLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWallet();
  }, [fetchWallet]);

  async function handleGenerateDynamicQR() {
    setError('');
    setDynamicQRData('');

    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount greater than 0.');
      return;
    }

    setGenerating(true);

    try {
      const token = localStorage.getItem('token');
      const csrfToken = generateCsrfToken();

      const res = await fetch('/api/qr/dynamic', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          amount: parseFloat(amount),
          description: description || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to generate QR code.');
        return;
      }

      // The API returns a PNG image. For the client-side QR display,
      // we build the same JSON payload string that QRService encodes,
      // using "address" as the key to match the QR parser format.
      const payload: Record<string, string> = {
        address: stellarAddress,
        amount: amount,
      };
      if (description) {
        payload.description = description;
      }
      setDynamicQRData(JSON.stringify(payload));
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">
        QR Code Management
      </h1>

      {/* Static QR Section */}
      <Card className="mb-6">
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          Static QR Code
        </h2>
        <p className="mb-4 text-sm text-gray-600">
          Share this QR code with customers. They can scan it to pay you
          directly.
        </p>

        <div className="flex flex-col items-center gap-3">
          {walletLoading ? (
            <div
              className="flex animate-pulse items-center justify-center rounded-lg bg-gray-100"
              style={{ width: 200, height: 200 }}
            >
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
            </div>
          ) : (
            /* Encode the Stellar address as JSON matching QRService format
               so the QR parser can decode it correctly. */
            <QRCodeDisplay
              value={stellarAddress ? JSON.stringify({ address: stellarAddress }) : ''}
              size={200}
            />
          )}
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

      {/* Dynamic QR Section */}
      <Card>
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          Generate Dynamic QR Code
        </h2>
        <p className="mb-4 text-sm text-gray-600">
          Create a QR code with a specific amount and optional description for a
          payment request.
        </p>

        <div className="space-y-4">
          <Input
            label="Amount (XLM)"
            type="number"
            min="0.0000001"
            step="any"
            placeholder="e.g. 10.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />

          <Input
            label="Description (optional)"
            type="text"
            placeholder="e.g. Coffee order #42"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
          />

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          <Button
            className="w-full"
            onClick={handleGenerateDynamicQR}
            loading={generating}
            disabled={!amount}
          >
            Generate QR Code
          </Button>

          {dynamicQRData && (
            <div className="flex flex-col items-center gap-3 pt-4">
              <QRCodeDisplay value={dynamicQRData} size={200} />
              <div className="text-center">
                <p className="text-sm font-medium text-gray-900">
                  {parseFloat(amount).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 7,
                  })}{' '}
                  XLM
                </p>
                {description && (
                  <p className="text-xs text-gray-500">{description}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
