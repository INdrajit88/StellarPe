'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { BottomNav } from '@/components/BottomNav';

/**
 * Dashboard route group layout.
 * Wraps all authenticated pages (/user/*, /merchant/*, /admin/*) with
 * the BottomNav component. Detects the user's role from localStorage
 * (set at login/register) and passes it to BottomNav.
 *
 * Admin users do not see the BottomNav since it's only for User and Merchant.
 *
 * @see Requirements 10.3 (User Bottom_Nav), 11.3 (Merchant Bottom_Nav)
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [role, setRole] = useState<'USER' | 'MERCHANT' | 'ADMIN' | null>(null);

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
    } catch {
      router.push('/login');
    }
  }, [router]);

  // Don't render until we know the role
  if (!role) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  // Admin pages don't get the BottomNav
  const isAdmin = pathname.startsWith('/admin');
  const showBottomNav = !isAdmin && (role === 'USER' || role === 'MERCHANT');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Main content area — add bottom padding when BottomNav is visible */}
      <main className={showBottomNav ? 'pb-20' : ''}>
        {children}
      </main>

      {showBottomNav && <BottomNav role={role} />}
    </div>
  );
}
