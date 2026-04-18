'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { BottomNav } from '@/components/BottomNav';
import { PinGateScreen } from '@/components/PinGateScreen';

/**
 * Dashboard route group layout.
 * Wraps all authenticated pages (/user/*, /merchant/*, /admin/*) with
 * the BottomNav component and a mandatory PIN Gate.
 *
 * After confirming auth, checks sessionStorage for 'pinVerified'.
 * If not verified, renders PinGateScreen (set or verify mode based on
 * user.pinHash) instead of children.
 *
 * Admin users do not see the BottomNav since it's only for User and Merchant.
 *
 * @see Requirements 10.3 (User Bottom_Nav), 11.3 (Merchant Bottom_Nav),
 *      14.1, 14.2, 14.3, 14.4, 14.5 (PIN Gate)
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<'USER' | 'MERCHANT' | 'ADMIN' | null>(null);
  const [pinVerified, setPinVerified] = useState(false);
  const [pinMode, setPinMode] = useState<'set' | 'verify'>('verify');

  useEffect(() => {
    // Read user data from localStorage (set during login/register)
    const userStr = localStorage.getItem('user');
    const token = localStorage.getItem('token');

    if (!token || !userStr) {
      router.push('/login');
      return;
    }

    try {
      const user = JSON.parse(userStr);
      setRole(user.role || 'USER');

      // Check if PIN has already been verified this session
      const verified = sessionStorage.getItem('pinVerified') === 'true';
      setPinVerified(verified);

      // Determine PIN Gate mode based on user's pinHash
      if (!verified) {
        setPinMode(user.pinHash ? 'verify' : 'set');
      }
    } catch {
      router.push('/login');
    }
  }, [router]);

  const handlePinSuccess = useCallback(() => {
    sessionStorage.setItem('pinVerified', 'true');
    setPinVerified(true);

    // If the user just set a PIN, update localStorage so future sessions
    // show the verify screen instead of set
    if (pinMode === 'set') {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          user.pinHash = 'set';
          localStorage.setItem('user', JSON.stringify(user));
        } catch {
          // ignore
        }
      }
    }
  }, [pinMode]);

  // Don't render until we know the role
  if (!role) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  // PIN Gate — block dashboard access until PIN is set/verified
  // Admin users bypass the PIN gate
  const isAdmin = pathname.startsWith('/admin');
  if (!pinVerified && !isAdmin && role !== 'ADMIN') {
    return <PinGateScreen mode={pinMode} onSuccess={handlePinSuccess} />;
  }

  // Admin pages don't get the BottomNav
  const showBottomNav = !isAdmin && (role === 'USER' || role === 'MERCHANT');

  return (
    <div className="min-h-screen overflow-x-hidden bg-gray-50">
      {/* Main content area — add bottom padding when BottomNav is visible */}
      <main className={showBottomNav ? 'pb-20' : ''}>
        {children}
      </main>

      {showBottomNav && <BottomNav role={role} />}
    </div>
  );
}
