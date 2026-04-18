import Link from 'next/link';
import { AppLogo } from '@/components/AppLogo';

/**
 * Fixed top navigation bar for the Landing Page.
 * Uses the glassmorphism `glass-card` class for a translucent backdrop.
 * Renders AppLogo on the left and a "Login" link on the right.
 * Responsive from 320px to 1440px.
 *
 * @see Requirements 1.1, 1.2, 1.3, 1.4, 1.5
 */
export function Navbar() {
  return (
    <nav
      className="glass-card fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 sm:px-6 md:px-8"
      style={{ borderRadius: 0, borderTop: 'none', borderLeft: 'none', borderRight: 'none' }}
    >
      <Link href="/" className="flex items-center gap-2" aria-label="StellarPe home">
        <AppLogo size={36} />
        <span className="text-lg font-semibold text-white">StellarPe</span>
      </Link>

      <Link
        href="/login"
        className="rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-white/20 hover:scale-105"
      >
        Login
      </Link>
    </nav>
  );
}

Navbar.displayName = 'Navbar';
