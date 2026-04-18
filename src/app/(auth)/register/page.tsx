'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';

/**
 * Generates a simple random CSRF token for inclusion in API requests.
 */
function generateCsrfToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Registration page — username, email, password, and role selection form.
 * On success, stores the JWT in localStorage and redirects to the user dashboard
 * (which is the PIN setup entry point).
 *
 * @see Requirements 1.1 (registration), 1.4 (JWT), 1.5 (error display)
 */
export default function RegisterPage() {
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'USER' | 'MERCHANT'>('USER');
  const [loading, setLoading] = useState(false);

  // Field-level validation errors from the API
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Top-level error (duplicate email/username, server error, etc.)
  const [generalError, setGeneralError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFieldErrors({});
    setGeneralError('');
    setLoading(true);

    try {
      const csrfToken = generateCsrfToken();

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ username, email, password, role }),
      });

      const data = await res.json();

      if (!res.ok) {
        // Structured field-level errors (from Zod validation)
        if (data.errors && typeof data.errors === 'object') {
          const mapped: Record<string, string> = {};
          for (const [field, messages] of Object.entries(data.errors)) {
            mapped[field] = Array.isArray(messages)
              ? messages.join(', ')
              : String(messages);
          }
          setFieldErrors(mapped);
        } else {
          // General error (duplicate, server error, etc.)
          setGeneralError(data.error || 'Registration failed. Please try again.');
        }
        return;
      }

      // Store JWT and user data
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      // Redirect to the user dashboard (PIN setup flow will prompt there)
      const userRole = data.user?.role;
      if (userRole === 'MERCHANT') {
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
          <h1 className="text-2xl font-bold text-gray-900">Create account</h1>
          <p className="mt-1 text-sm text-gray-600">
            Get started with StellarPay
          </p>
        </div>
      }
      className="shadow-md border-gray-300"
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
          label="Username"
          type="text"
          placeholder="stellar_user"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          error={fieldErrors.username}
          required
          autoComplete="username"
        />

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
          placeholder="Min. 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          required
          autoComplete="new-password"
        />

        {/* Role selection */}
        <fieldset>
          <legend className="mb-1 block text-sm font-medium text-gray-700">
            Account type
          </legend>
          <div className="flex gap-4">
            <label
              className={`flex flex-1 cursor-pointer items-center justify-center rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                role === 'USER'
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="role"
                value="USER"
                checked={role === 'USER'}
                onChange={() => setRole('USER')}
                className="sr-only"
              />
              User
            </label>

            <label
              className={`flex flex-1 cursor-pointer items-center justify-center rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                role === 'MERCHANT'
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="role"
                value="MERCHANT"
                checked={role === 'MERCHANT'}
                onChange={() => setRole('MERCHANT')}
                className="sr-only"
              />
              Merchant
            </label>
          </div>
          {fieldErrors.role && (
            <p className="mt-1 text-sm text-red-600" role="alert">
              {fieldErrors.role}
            </p>
          )}
        </fieldset>

        <Button
          type="submit"
          loading={loading}
          className="w-full"
          size="md"
        >
          Create account
        </Button>
      </form>

      <p className="mt-4 text-center text-sm text-gray-600">
        Already have an account?{' '}
        <Link
          href="/login"
          className="font-medium text-indigo-600 hover:text-indigo-500"
        >
          Sign in
        </Link>
      </p>
    </Card>
  );
}
