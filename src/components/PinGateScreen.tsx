'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { GlassCard } from '@/components/ui/GlassCard';
import { PinInput, PinInputHandle } from '@/components/ui/PinInput';
import { AppLogo } from '@/components/AppLogo';

export interface PinGateScreenProps {
  /** Whether to show the "Set PIN" or "Verify PIN" screen */
  mode: 'set' | 'verify';
  /** Callback fired on successful PIN set or verification */
  onSuccess: () => void;
}

/** CSRF token generator for state-mutating requests */
function generateCsrfToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * PIN Gate screen — displayed after login before granting dashboard access.
 * Shows either a "Set PIN" or "Verify PIN" form depending on the user's state.
 *
 * Features:
 * - Calls POST /api/users/pin (set mode) or POST /api/users/pin/verify (verify mode)
 * - Displays inline error messages for incorrect PIN, lockout with countdown, network errors
 * - Clears PIN input on error
 * - Styled with glassmorphism design language
 *
 * @see Requirements 14.1, 14.2, 14.5, 14.6, 14.7, 14.8, 14.9
 */
export function PinGateScreen({ mode, onSuccess }: PinGateScreenProps) {
  const pinInputRef = useRef<PinInputHandle>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState('');

  // Countdown timer for lockout
  useEffect(() => {
    if (!lockedUntil) {
      setCountdown('');
      return;
    }

    function updateCountdown() {
      const now = new Date();
      const diff = lockedUntil!.getTime() - now.getTime();

      if (diff <= 0) {
        setLockedUntil(null);
        setError('');
        setCountdown('');
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setCountdown(`${minutes}:${seconds.toString().padStart(2, '0')}`);
    }

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [lockedUntil]);

  const handleComplete = useCallback(
    async (pin: string) => {
      setError('');
      setLoading(true);

      try {
        const token = localStorage.getItem('token');
        const csrfToken = generateCsrfToken();

        const url = mode === 'set' ? '/api/users/pin' : '/api/users/pin/verify';

        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'x-csrf-token': csrfToken,
          },
          body: JSON.stringify({ pin }),
        });

        const data = await res.json();

        if (res.ok) {
          onSuccess();
          return;
        }

        // Handle lockout (423)
        if (res.status === 423) {
          if (data.lockedUntil) {
            setLockedUntil(new Date(data.lockedUntil));
          }
          setError('Account locked due to too many failed attempts.');
          pinInputRef.current?.clear();
          return;
        }

        // Handle incorrect PIN (401)
        if (res.status === 401) {
          const remaining = data.attemptsRemaining;
          setError(
            remaining !== undefined
              ? `Incorrect PIN. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`
              : 'Incorrect PIN. Please try again.'
          );
          pinInputRef.current?.clear();
          return;
        }

        // Other errors
        setError(data.error || 'Failed to process PIN. Please try again.');
        pinInputRef.current?.clear();
      } catch {
        setError('Network error. Please try again.');
        pinInputRef.current?.clear();
      } finally {
        setLoading(false);
      }
    },
    [mode, onSuccess]
  );

  const isLocked = !!lockedUntil;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 px-4">
      <GlassCard className="w-full max-w-sm p-8">
        <div className="flex flex-col items-center gap-6">
          {/* Logo */}
          <AppLogo size={64} />

          {/* Title */}
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white">
              {mode === 'set' ? 'Set Your PIN' : 'Enter Your PIN'}
            </h1>
            <p className="mt-2 text-sm text-white/70">
              {mode === 'set'
                ? 'Create a 4-6 digit PIN to secure your transactions.'
                : 'Enter your PIN to access your dashboard.'}
            </p>
          </div>

          {/* Lockout countdown */}
          {isLocked && countdown && (
            <div className="w-full rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-center text-sm text-yellow-300">
              Account locked. Try again in {countdown}
            </div>
          )}

          {/* PIN Input */}
          <PinInput
            ref={pinInputRef}
            length={4}
            mask
            label={mode === 'set' ? 'New PIN' : 'PIN'}
            error={error}
            disabled={loading || isLocked}
            onComplete={handleComplete}
          />

          {/* Loading indicator */}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-white/60">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              {mode === 'set' ? 'Setting PIN...' : 'Verifying...'}
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
}

PinGateScreen.displayName = 'PinGateScreen';
