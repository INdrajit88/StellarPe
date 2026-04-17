'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface UserInfo {
  id: string;
  username: string;
  email: string;
  role: string;
}

interface MerchantProfileData {
  businessName: string;
  description: string | null;
}

/**
 * Merchant Profile page.
 * Displays merchant info: username, email, role, Stellar address,
 * business name, and description. Includes a logout button.
 *
 * @see Requirements 11.1 (merchant dashboard / profile info)
 */
export default function MerchantProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [profile, setProfile] = useState<MerchantProfileData | null>(null);
  const [stellarAddress, setStellarAddress] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load user info from localStorage
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const parsed = JSON.parse(userStr);
        setUser(parsed);

        // Extract merchant profile data if available
        if (parsed.merchantProfile) {
          setProfile({
            businessName: parsed.merchantProfile.businessName || '',
            description: parsed.merchantProfile.description || null,
          });
        }
      } catch {
        // ignore
      }
    }

    // Fetch wallet details to get Stellar address
    async function fetchWallet() {
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
        // Silently fail — Stellar address display is supplementary
      } finally {
        setLoading(false);
      }
    }

    fetchWallet();
  }, []);

  function handleLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/login');
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-6 sm:px-6">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Profile</h1>
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
        </div>
      </div>
    );
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
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
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

          {stellarAddress && (
            <div className="border-t border-gray-100 pt-3">
              <div className="text-sm">
                <span className="text-gray-500">Stellar Address</span>
                <p
                  className="mt-1 break-all font-mono text-xs text-gray-900"
                  title={stellarAddress}
                >
                  {stellarAddress}
                </p>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Business Info */}
      <Card className="mb-6">
        <h2 className="mb-3 text-base font-semibold text-gray-900">
          Business Information
        </h2>
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Business Name</span>
            <span className="font-medium text-gray-900">
              {profile?.businessName || '—'}
            </span>
          </div>
          <div className="border-t border-gray-100 pt-3">
            <p className="mb-1 text-sm text-gray-500">Description</p>
            <p className="text-sm text-gray-900">
              {profile?.description || 'No description provided.'}
            </p>
          </div>
        </div>
      </Card>

      {/* Logout */}
      <Button variant="outline" className="w-full" onClick={handleLogout}>
        Log Out
      </Button>
    </div>
  );
}
