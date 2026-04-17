'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { PinInput, PinInputHandle } from '@/components/ui/PinInput';
import { UsernameAutocomplete } from '@/components/UsernameAutocomplete';

/** CSRF token generator for state-mutating requests */
function generateCsrfToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

interface TransactionResult {
  id: string;
  stellarTxId: string;
  amount: string;
  recipientAddress: string;
  status: string;
}

/**
 * Send Payment page.
 * Payment form with recipient (username or Stellar address with autocomplete),
 * amount, optional memo, and PIN input modal for authorization.
 * Displays success/error result with transaction ID.
 *
 * @see Requirements 3.1–3.10 (send payment flow),
 *      4.3 (PIN required), 4.8 (mobile numeric input),
 *      9.5 (username autocomplete), 10.4 (Send quick-pay)
 */
export default function SendPaymentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pinInputRef = useRef<PinInputHandle>(null);

  // Form state
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');

  // Pre-populate from URL search params (e.g. from QR scan or contacts quick-pay)
  useEffect(() => {
    const recipientParam = searchParams.get('recipient');
    const amountParam = searchParams.get('amount');
    const memoParam = searchParams.get('memo');
    if (recipientParam) setRecipient(recipientParam);
    if (amountParam) setAmount(amountParam);
    if (memoParam) setMemo(memoParam);
  }, [searchParams]);

  // PIN modal state
  const [showPinModal, setShowPinModal] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');

  // Submission state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Result state
  const [result, setResult] = useState<TransactionResult | null>(null);

  // Resolved Stellar address from autocomplete
  const [resolvedAddress, setResolvedAddress] = useState('');

  function handleRecipientSelect(user: { username: string; stellarAddress: string }) {
    setResolvedAddress(user.stellarAddress);
  }

  function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    // Basic client-side validation
    if (!recipient.trim()) {
      setFieldErrors({ recipient: 'Recipient is required' });
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      setFieldErrors({ amount: 'Enter a valid amount greater than 0' });
      return;
    }

    // Open PIN modal for authorization
    setShowPinModal(true);
    setPinError('');
    setPin('');
    // Focus PIN input after modal opens
    setTimeout(() => pinInputRef.current?.focus(), 100);
  }

  async function handlePinSubmit(pinValue: string) {
    setPin(pinValue);
    setPinError('');
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const csrfToken = generateCsrfToken();

      const res = await fetch('/api/payments/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({
          recipient: recipient.trim(),
          amount: parseFloat(amount),
          pin: pinValue,
          memo: memo.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        // Handle specific error codes
        if (data.code === 'INCORRECT_PIN') {
          setPinError('Incorrect PIN. Please try again.');
          pinInputRef.current?.clear();
          setLoading(false);
          return;
        }
        if (data.code === 'ACCOUNT_LOCKED') {
          setPinError('Account locked due to too many failed attempts. Try again later.');
          setLoading(false);
          return;
        }

        // Close PIN modal for other errors
        setShowPinModal(false);
        setError(data.error || 'Payment failed. Please try again.');
        setLoading(false);
        return;
      }

      // Success
      setShowPinModal(false);
      setResult(data.transaction);
    } catch {
      setShowPinModal(false);
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleNewPayment() {
    setResult(null);
    setRecipient('');
    setAmount('');
    setMemo('');
    setResolvedAddress('');
    setError('');
    setFieldErrors({});
  }

  // Success result view
  if (result) {
    return (
      <div className="mx-auto max-w-lg px-4 py-6 sm:px-6">
        <Card>
          <div className="flex flex-col items-center gap-4 py-4 text-center">
            {/* Success icon */}
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h2 className="text-xl font-bold text-gray-900">Payment Sent</h2>

            <div className="w-full space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Amount</span>
                <span className="font-medium text-gray-900">
                  {parseFloat(result.amount).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 7,
                  })}{' '}
                  XLM
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">To</span>
                <span className="truncate ml-2 font-medium text-gray-900" title={result.recipientAddress}>
                  {result.recipientAddress.slice(0, 8)}...{result.recipientAddress.slice(-6)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <span className="font-medium text-green-600">{result.status}</span>
              </div>
              {result.stellarTxId && (
                <div className="flex justify-between">
                  <span className="text-gray-500">TX ID</span>
                  <span className="truncate ml-2 font-mono text-xs text-gray-600" title={result.stellarTxId}>
                    {result.stellarTxId.slice(0, 16)}...
                  </span>
                </div>
              )}
            </div>

            <div className="flex w-full gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => router.push('/user')}
              >
                Dashboard
              </Button>
              <Button className="flex-1" onClick={handleNewPayment}>
                Send Another
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Send Payment</h1>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <Card>
        <form onSubmit={handleFormSubmit} className="space-y-4" noValidate>
          {/* Recipient field with autocomplete */}
          <UsernameAutocomplete
            label="Recipient"
            value={recipient}
            onChange={(val) => {
              setRecipient(val);
              setResolvedAddress('');
            }}
            onSelect={handleRecipientSelect}
            placeholder="Username or Stellar address"
            error={fieldErrors.recipient}
          />

          {resolvedAddress && (
            <p className="text-xs text-gray-400 -mt-2">
              Resolved: {resolvedAddress.slice(0, 12)}...{resolvedAddress.slice(-8)}
            </p>
          )}

          {/* Amount */}
          <Input
            label="Amount (XLM)"
            type="number"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={fieldErrors.amount}
            min="0.0000001"
            step="0.0000001"
            required
          />

          {/* Memo (optional) */}
          <Input
            label="Memo (optional)"
            type="text"
            placeholder="Payment note"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            maxLength={28}
          />

          <Button
            type="submit"
            className="w-full"
            size="md"
            disabled={loading}
          >
            Continue
          </Button>
        </form>
      </Card>

      {/* PIN Authorization Modal */}
      <Modal
        open={showPinModal}
        onClose={() => {
          if (!loading) {
            setShowPinModal(false);
            setPinError('');
          }
        }}
        title="Enter PIN to Authorize"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 text-center">
            Sending{' '}
            <span className="font-semibold">
              {amount ? parseFloat(amount).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 7,
              }) : '0'}{' '}
              XLM
            </span>{' '}
            to <span className="font-semibold">{recipient}</span>
          </p>

          <PinInput
            ref={pinInputRef}
            length={4}
            mask
            label="Transaction PIN"
            error={pinError}
            disabled={loading}
            onComplete={handlePinSubmit}
          />

          {loading && (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
              <svg
                className="h-4 w-4 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Processing payment...
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
