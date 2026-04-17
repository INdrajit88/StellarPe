'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Navigation item definition */
interface NavItem {
  /** Display label */
  label: string;
  /** Route path */
  href: string;
  /** SVG icon element */
  icon: React.ReactNode;
}

export interface BottomNavProps {
  /** User role determines which navigation items to display */
  role: 'USER' | 'MERCHANT';
}

/* ------------------------------------------------------------------ */
/*  SVG icon components – lightweight placeholders for each nav item  */
/* ------------------------------------------------------------------ */

const DashboardIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1h-2z"
    />
  </svg>
);

const SendIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
    />
  </svg>
);

const ContactsIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m9-4a4 4 0 10-8 0 4 4 0 008 0zm6 4a4 4 0 10-8 0h8z"
    />
  </svg>
);

const HistoryIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const ProfileIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5.121 17.804A9 9 0 0112 15a9 9 0 016.879 2.804M15 11a3 3 0 11-6 0 3 3 0 016 0z"
    />
  </svg>
);

const QRCodeIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm14 3h.01M17 17h.01M14 14h3v3h-3v-3zm3 3h3v3h-3v-3z"
    />
  </svg>
);

const TransactionsIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 5h6m-3 4v6m-3-3h6"
    />
  </svg>
);

const AnalyticsIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6m6 0h6m-6 0V9a2 2 0 012-2h2a2 2 0 012 2v10m6 0v-4a2 2 0 00-2-2h-2a2 2 0 00-2 2v4"
    />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Nav item definitions per role                                      */
/* ------------------------------------------------------------------ */

/** User navigation items (Requirement 10.3) */
const USER_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/user', icon: <DashboardIcon /> },
  { label: 'Send', href: '/user/send', icon: <SendIcon /> },
  { label: 'Contacts', href: '/user/contacts', icon: <ContactsIcon /> },
  { label: 'History', href: '/user/history', icon: <HistoryIcon /> },
  { label: 'Profile', href: '/user/profile', icon: <ProfileIcon /> },
];

/** Merchant navigation items (Requirement 11.3) */
const MERCHANT_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/merchant', icon: <DashboardIcon /> },
  { label: 'QR Codes', href: '/merchant/qr', icon: <QRCodeIcon /> },
  { label: 'Transactions', href: '/merchant/transactions', icon: <TransactionsIcon /> },
  { label: 'Analytics', href: '/merchant/analytics', icon: <AnalyticsIcon /> },
  { label: 'Profile', href: '/merchant/profile', icon: <ProfileIcon /> },
];

/**
 * Determine whether a nav item is active based on the current pathname.
 * For root dashboard routes (/user, /merchant) we require an exact match
 * to avoid highlighting Dashboard when on a sub-page. For all other routes
 * we use a startsWith check so nested pages still highlight the parent tab.
 */
export function isActiveRoute(pathname: string, href: string): boolean {
  // Root dashboard routes need exact match
  if (href === '/user' || href === '/merchant') {
    return pathname === href;
  }
  // Sub-routes: active if pathname starts with the href
  return pathname.startsWith(href);
}

/**
 * Return the nav items for a given role.
 * Exported for testability.
 */
export function getNavItems(role: 'USER' | 'MERCHANT'): NavItem[] {
  return role === 'MERCHANT' ? MERCHANT_NAV_ITEMS : USER_NAV_ITEMS;
}

/**
 * Mobile bottom navigation bar for authenticated User and Merchant screens.
 * Fixed to the bottom of the viewport, highlights the active route.
 *
 * Requirements: 10.3 (User Bottom_Nav), 11.3 (Merchant Bottom_Nav)
 */
export function BottomNav({ role }: BottomNavProps) {
  const pathname = usePathname();
  const items = getNavItems(role);

  return (
    <nav
      aria-label={`${role === 'MERCHANT' ? 'Merchant' : 'User'} navigation`}
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white pb-safe"
    >
      <ul className="flex items-center justify-around" role="list">
        {items.map((item) => {
          const active = isActiveRoute(pathname, item.href);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                aria-label={item.label}
                className={`
                  flex flex-col items-center justify-center px-2 py-2 text-xs font-medium
                  transition-colors duration-150
                  ${
                    active
                      ? 'text-indigo-600'
                      : 'text-gray-500 hover:text-gray-700'
                  }
                `}
              >
                {item.icon}
                <span className="mt-1">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

BottomNav.displayName = 'BottomNav';
