'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

/**
 * Dynamically import QRScanner with SSR disabled since html5-qrcode
 * requires browser APIs (navigator.mediaDevices, window).
 */
const QRScanner = dynamic(
  () => import('@/components/QRScanner').then((mod) => mod.QRScanner),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    ),
  },
);

/** CSRF token generator for state-mutating requests */
function generateCsrfToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * QR Scan page.
 * Activates the device camera, scans a QR code, parses the payload
 * via /api/qr/parse, and navigates to the send payment form with
 * pre-populated data (recipient address, amount, description).
 *
 * @see Requirements 7.4 (scan QR and parse), 10.5 (Scan QR action)
 */
export default function ScanPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [parsing, setParsing] = useState(false);

  const handleScan = useCallback(
    async (decodedText: string) => {
      setError('');
      setParsing(true);

      try {
        const token = localStorage.getItem('token');
        const csrfToken = generateCsrfToken();

        // Try to parse the QR data locally first.
        // If it's valid JSON with an address field, use the parse API.
        // If it's a raw string (e.g. a Stellar address or wallet ID), use it directly.
        let address: string | undefined;
        let amount: string | undefined;
        let memo: string | undefined;

        try {
          const parsed = JSON.parse(decodedText);
          if (parsed && typeof parsed === 'object' && typeof parsed.address === 'string') {
            // Valid JSON QR payload — use the parse API for full validation
            const res = await fetch('/api/qr/parse', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
                'x-csrf-token': csrfToken,
              },
              body: JSON.stringify({ data: decodedText }),
            });

            const data = await res.json();

            if (!res.ok) {
              setError(data.error || 'Invalid QR code. Please try again.');
              setParsing(false);
              return;
            }

            address = data.address;
            amount = data.amount;
            memo = data.description;
          } else {
            // JSON but no address field — treat as invalid
            setError('Invalid QR code format. Please try again.');
            setParsing(false);
            return;
          }
        } catch {
          // Not valid JSON — treat the raw text as a wallet ID / Stellar address
          const trimmed = decodedText.trim();
          if (trimmed.length > 0) {
            address = trimmed;
          } else {
            setError('Empty QR code. Please try again.');
            setParsing(false);
            return;
          }
        }

        // Navigate to send page with pre-populated data
        const params = new URLSearchParams();
        if (address) params.set('recipient', address);
        if (amount) params.set('amount', amount);
        if (memo) params.set('memo', memo);

        router.push(`/user/send?${params.toString()}`);
      } catch {
        setError('Network error. Please check your connection and try again.');
        setParsing(false);
      }
    },
    [router],
  );

  const handleScanError = useCallback((errorMsg: string) => {
    setError(errorMsg);
  }, []);

  return (
    <div className="mx-auto max-w-lg px-4 py-6 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Scan QR Code</h1>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {parsing ? (
        <Card>
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
            <p className="text-sm text-gray-500">Processing QR code...</p>
          </div>
        </Card>
      ) : (
        <Card>
          <p className="mb-4 text-sm text-gray-600 text-center">
            Point your camera at a QR code to scan it
          </p>
          <QRScanner onScan={handleScan} onError={handleScanError} />
        </Card>
      )}

      <div className="mt-4">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => router.push('/user')}
        >
          Back to Dashboard
        </Button>
      </div>
    </div>
  );
}
