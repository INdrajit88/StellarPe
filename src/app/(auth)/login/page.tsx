'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';

/**
 * Generates a simple random CSRF token for inclusion in API requests.
 * In production this would come from a server-set cookie or meta tag.
 */
function generateCsrfToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Login page — email + password form.
 * On success, stores the JWT in localStorage and redirects to the
 * appropriate dashboard based on the user's role.
 *
 * @see Requirements 1.4 (JWT on login), 1.5 (generic error on invalid credentials)
 */
export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Field-level validation errors returned from the API
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Top-level error (invalid credentials, account locked, etc.)
  const [generalError, setGeneralError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setGeneralError('');
    setLoading(true);

    try {
      const csrfToken = generateCsrfToken();

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        // If the API returns structured field errors, display them per-field
        if (data.errors && typeof data.errors === 'object') {
          const mapped: Record<string, string> = {};
          for (const [field, messages] of Object.entries(data.errors)) {
            mapped[field] = Array.isArray(messages)
              ? messages.join(', ')
              : String(messages);
          }
          setFieldErrors(mapped);
        } else {
          // Generic error (invalid credentials, locked, rate-limited, etc.)
          setGeneralError(data.error || 'Login failed. Please try again.');
        }
        return;
      }

      // Store JWT and redirect based on role
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      const role = data.user?.role;
      if (role === 'ADMIN') {
        router.push('/admin');
      } else if (role === 'MERCHANT') {
        router.push('/merchant');
      } else {
        router.push('/user');
      }
    } catch {
      setGeneralError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card
      header={
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
          <p className="mt-1 text-sm text-gray-500">
            Sign in to your StellarPay account
          </p>
        </div>
      }
    >
      {generalError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {generalError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          required
          autoComplete="email"
        />

        <Input
          label="Password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          required
          autoComplete="current-password"
        />

        <Button
          type="submit"
          loading={loading}
          className="w-full"
          size="md"
        >
          Sign in
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-gray-500">
        Don&apos;t have an account?{' '}
        <Link
          href="/register"
          className="font-medium text-indigo-600 hover:text-indigo-500"
        >
          Create one
        </Link>
      </p>
    </Card>
  );
}
