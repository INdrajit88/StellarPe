'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { PinInput, PinInputHandle } from '@/components/ui/PinInput';

/** CSRF token generator for state-mutating requests */
function generateCsrfToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

interface UserInfo {
  id: string;
  username: string;
  email: string;
  role: string;
  pinHash: string | null;
}

/**
 * User Profile page.
 * Displays user info (username, email, role) and PIN management:
 * - Set PIN section (if no PIN set)
 * - Reset PIN section (if PIN already set)
 *
 * @see Requirements 4.1 (set 4-6 digit PIN), 4.6 (PIN reset),
 *      4.7 (invalidate sessions on PIN change)
 */
export default function ProfilePage() {
  const router = useRouter();
  const pinInputRef = useRef<PinInputHandle>(null);

  const [user, setUser] = useState<UserInfo | null>(null);
  const [hasPinSet, setHasPinSet] = useState(false);

  // PIN form state
  const [pin, setPin] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [pinError, setPinError] = useState('');
  const [pinSuccess, setPinSuccess] = useState('');

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const parsed = JSON.parse(userStr);
        setUser(parsed);
        // If pinHash exists in the stored user data, PIN is set
        setHasPinSet(!!parsed.pinHash);
      } catch {
        // ignore
      }
    }
  }, []);

  async function handleSetPin(pinValue: string) {
    setPin(pinValue);
    setPinError('');
    setPinSuccess('');
    setPinLoading(true);

    try {
      const token = localStorage.getItem('token');
      const csrfToken = generateCsrfToken();

      const res = await fetch('/api/users/pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ pin: pinValue }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPinError(data.error || 'Failed to set PIN.');
        pinInputRef.current?.clear();
        setPinLoading(false);
        return;
      }

      setPinSuccess('Transaction PIN set successfully.');
      setHasPinSet(true);

      // Update stored user data
      const userStr = localStorage.getItem('user');
      if (userStr) {
        try {
          const parsed = JSON.parse(userStr);
          parsed.pinHash = 'set';
          localStorage.setItem('user', JSON.stringify(parsed));
        } catch {
          // ignore
        }
      }
    } catch {
      setPinError('Network error. Please try again.');
    } finally {
      setPinLoading(false);
    }
  }

  async function handleResetPin(pinValue: string) {
    setPin(pinValue);
    setPinError('');
    setPinSuccess('');
    setPinLoading(true);

    try {
      const token = localStorage.getItem('token');
      const csrfToken = generateCsrfToken();

      const res = await fetch('/api/users/pin', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ newPin: pinValue }),
      });

      const data = await res.json();

      if (!res.ok) {
        setPinError(data.error || 'Failed to reset PIN.');
        pinInputRef.current?.clear();
        setPinLoading(false);
        return;
      }

      // Per Requirement 4.7: PIN change invalidates all sessions.
      // Clear local storage and redirect to login.
      setPinSuccess('PIN reset successfully. Redirecting to login...');
      setTimeout(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.push('/login');
      }, 2000);
    } catch {
      setPinError('Network error. Please try again.');
    } finally {
      setPinLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/login');
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6 sm:px-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Profile</h1>

      {/* User Info */}
      <Card className="mb-6">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6 text-indigo-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
            <div>
              <p className="text-lg font-semibold text-gray-900">
                {user?.username || '—'}
              </p>
              <p className="text-sm text-gray-500">{user?.email || '—'}</p>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Role</span>
              <span className="font-medium text-gray-900">
                {user?.role || '—'}
              </span>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Transaction PIN</span>
              <span
                className={`font-medium ${hasPinSet ? 'text-green-600' : 'text-yellow-600'}`}
              >
                {hasPinSet ? 'Set' : 'Not set'}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* PIN Management */}
      <Card className="mb-6">
        <h2 className="mb-4 text-base font-semibold text-gray-900">
          {hasPinSet ? 'Reset Transaction PIN' : 'Set Transaction PIN'}
        </h2>

        <p className="mb-4 text-sm text-gray-600">
          {hasPinSet
            ? 'Enter a new 4-6 digit PIN to replace your current one. You will be logged out after resetting.'
            : 'Set a 4-6 digit PIN to authorize payments. This PIN is required for all transactions.'}
        </p>

        {pinSuccess && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {pinSuccess}
          </div>
        )}

        <PinInput
          ref={pinInputRef}
          length={4}
          mask
          label={hasPinSet ? 'New PIN' : 'PIN'}
          error={pinError}
          disabled={pinLoading}
          onComplete={hasPinSet ? handleResetPin : handleSetPin}
        />

        {pinLoading && (
          <div className="mt-3 flex items-center justify-center gap-2 text-sm text-gray-500">
            <svg
              className="h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            {hasPinSet ? 'Resetting PIN...' : 'Setting PIN...'}
          </div>
        )}
      </Card>

      {/* Logout */}
      <Button
        variant="outline"
        className="w-full"
        onClick={handleLogout}
      >
        Log Out
      </Button>
    </div>
  );
}
