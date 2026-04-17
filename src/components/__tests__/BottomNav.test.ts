/**
 * Unit tests for BottomNav component logic.
 *
 * Tests the exported helper functions (getNavItems, isActiveRoute) that drive
 * the component's behaviour. DOM rendering is not tested here because the
 * project does not include @testing-library/react; the logic layer is the
 * critical piece to validate.
 *
 * Validates: Requirements 10.3, 11.3
 */

import { getNavItems, isActiveRoute } from '../BottomNav';

describe('BottomNav – getNavItems', () => {
  it('returns 5 items for USER role', () => {
    const items = getNavItems('USER');
    expect(items).toHaveLength(5);
  });

  it('returns correct labels for USER role', () => {
    const labels = getNavItems('USER').map((i) => i.label);
    expect(labels).toEqual(['Dashboard', 'Send', 'Contacts', 'History', 'Profile']);
  });

  it('returns correct hrefs for USER role', () => {
    const hrefs = getNavItems('USER').map((i) => i.href);
    expect(hrefs).toEqual([
      '/user',
      '/user/send',
      '/user/contacts',
      '/user/history',
      '/user/profile',
    ]);
  });

  it('returns 5 items for MERCHANT role', () => {
    const items = getNavItems('MERCHANT');
    expect(items).toHaveLength(5);
  });

  it('returns correct labels for MERCHANT role', () => {
    const labels = getNavItems('MERCHANT').map((i) => i.label);
    expect(labels).toEqual(['Dashboard', 'QR Codes', 'Transactions', 'Analytics', 'Profile']);
  });

  it('returns correct hrefs for MERCHANT role', () => {
    const hrefs = getNavItems('MERCHANT').map((i) => i.href);
    expect(hrefs).toEqual([
      '/merchant',
      '/merchant/qr',
      '/merchant/transactions',
      '/merchant/analytics',
      '/merchant/profile',
    ]);
  });
});

describe('BottomNav – isActiveRoute', () => {
  // User dashboard – exact match
  it('marks /user as active when pathname is /user', () => {
    expect(isActiveRoute('/user', '/user')).toBe(true);
  });

  it('does NOT mark /user as active when pathname is /user/send', () => {
    expect(isActiveRoute('/user/send', '/user')).toBe(false);
  });

  // Merchant dashboard – exact match
  it('marks /merchant as active when pathname is /merchant', () => {
    expect(isActiveRoute('/merchant', '/merchant')).toBe(true);
  });

  it('does NOT mark /merchant as active when pathname is /merchant/qr', () => {
    expect(isActiveRoute('/merchant/qr', '/merchant')).toBe(false);
  });

  // Sub-routes – startsWith match
  it('marks /user/send as active when pathname is /user/send', () => {
    expect(isActiveRoute('/user/send', '/user/send')).toBe(true);
  });

  it('marks /user/contacts as active for nested path /user/contacts/123', () => {
    expect(isActiveRoute('/user/contacts/123', '/user/contacts')).toBe(true);
  });

  it('does NOT mark /user/send as active when pathname is /user/history', () => {
    expect(isActiveRoute('/user/history', '/user/send')).toBe(false);
  });

  it('marks /merchant/transactions as active for exact match', () => {
    expect(isActiveRoute('/merchant/transactions', '/merchant/transactions')).toBe(true);
  });

  it('marks /merchant/analytics as active for nested path', () => {
    expect(isActiveRoute('/merchant/analytics/details', '/merchant/analytics')).toBe(true);
  });
});
