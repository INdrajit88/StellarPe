/**
 * @jest-environment jsdom
 */

/**
 * Bug Condition Exploration Property Test
 *
 * This test suite surfaces counterexamples that demonstrate four bugs
 * in the StellarPe application BEFORE any fixes are applied.
 *
 * EXPECTED OUTCOME: These tests FAIL on unfixed code — failure confirms the bugs exist.
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
 */

import { describe, it, expect, jest } from '@jest/globals';
import React from 'react';
import fc from 'fast-check';
import { parseQRPayload } from '@/lib/services/qr.service';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock next/navigation for components that use useRouter
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
  }),
}));

// Mock next/link as a simple anchor
jest.mock('next/link', () => {
  return {
    __esModule: true,
    default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => {
      return React.createElement('a', { href, ...props }, children);
    },
  };
});

// Mock the ToastContext so CopyButton and QRDownloadButton don't throw
jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ show: jest.fn() }),
}));

// Mock qrcode.react since it's a client-side SVG renderer
jest.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value, size }: { value: string; size: number }) => {
    return React.createElement('svg', { 'data-testid': 'qr-svg', 'data-value': value, width: size, height: size });
  },
}));

// Import render at top level to avoid "hooks inside tests" warning
import { render } from '@testing-library/react';
import { ProfileCard } from '@/components/ProfileCard';
import { TransactionList } from '@/components/TransactionList';
import LoginPage from '@/app/(auth)/login/page';

// ─── Generators ──────────────────────────────────────────────────────────────

/**
 * Generates valid Stellar addresses: 56 chars, starting with G, base32 A-Z2-7.
 */
const stellarAddressArb = fc.tuple(
  fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.split('')),
  fc.array(
    fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.split('')),
    { minLength: 54, maxLength: 54 }
  )
).map(([second, rest]) => 'G' + second + rest.join(''));

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Bug Condition Exploration', () => {

  describe('Bug 1: QR Encoding Mismatch', () => {
    /**
     * Property: For any valid Stellar address, the value that ProfileCard
     * passes to QRCodeDisplay should be valid JSON parseable by parseQRPayload,
     * and the extracted address field should equal the original address.
     *
     * On unfixed code, ProfileCard passes the raw address string directly,
     * so parseQRPayload will throw "Invalid QR payload: data is not valid JSON".
     *
     * **Validates: Requirements 2.1**
     */
    it('ProfileCard QR value should be parseable by parseQRPayload for any valid Stellar address', () => {
      fc.assert(
        fc.property(stellarAddressArb, (address: string) => {
          // Render ProfileCard — in production, walletId IS the stellarAddress
          const { container, unmount } = render(
            React.createElement(ProfileCard, {
              username: 'testuser',
              walletId: address,
              stellarAddress: address,
            })
          );

          // The mocked QRCodeSVG stores the value in data-value attribute
          const qrSvg = container.querySelector('[data-testid="qr-svg"]');
          expect(qrSvg).not.toBeNull();

          const qrValue = qrSvg!.getAttribute('data-value');
          expect(qrValue).not.toBeNull();

          // This should NOT throw — the QR value should be valid JSON
          const parsed = parseQRPayload(qrValue!);

          // The parsed address should match the original
          expect(parsed.address).toBe(address);

          unmount();
        }),
        { numRuns: 20 }
      );
    });
  });

  describe('Bug 2: Profile Card Text Contrast', () => {
    /**
     * Property: ProfileCard username should use text-gray-900 (not text-white)
     * and wallet ID should use text-gray-500 (not text-gray-300) for readability
     * on a light background.
     *
     * On unfixed code, username has text-white and wallet ID has text-gray-300.
     *
     * **Validates: Requirements 2.2**
     */
    it('ProfileCard should use dark text colors for readability on light backgrounds', () => {
      const { container } = render(
        React.createElement(ProfileCard, {
          username: 'alice',
          walletId: 'wallet-abc-123',
          stellarAddress: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV',
        })
      );

      // Check username element has text-gray-900 class
      const usernameEl = container.querySelector('h2');
      expect(usernameEl).not.toBeNull();
      expect(usernameEl!.className).toContain('text-gray-900');
      expect(usernameEl!.className).not.toContain('text-white');

      // Check wallet ID element has text-gray-500 class
      const walletIdSpan = container.querySelector('span.truncate');
      expect(walletIdSpan).not.toBeNull();
      expect(walletIdSpan!.className).toContain('text-gray-500');
      expect(walletIdSpan!.className).not.toContain('text-gray-300');
    });
  });

  describe('Bug 3: Login Page Visibility', () => {
    /**
     * Property: The login page subtitle should use text-gray-600 (not text-gray-500)
     * for better visual prominence.
     *
     * On unfixed code, the subtitle uses text-gray-500.
     *
     * **Validates: Requirements 2.3**
     */
    it('Login page subtitle should use text-gray-600 for sufficient contrast', () => {
      const { container } = render(React.createElement(LoginPage));

      // Find the subtitle paragraph "Sign in to your StellarPay account"
      const subtitleEl = Array.from(container.querySelectorAll('p')).find(
        (p: HTMLParagraphElement) => p.textContent?.includes('Sign in to your StellarPay account')
      );

      expect(subtitleEl).not.toBeUndefined();
      expect(subtitleEl!.className).toContain('text-gray-600');
      expect(subtitleEl!.className).not.toContain('text-gray-500');
    });
  });

  describe('Bug 4: Transaction Explorer Link', () => {
    /**
     * Property: For any transaction with a non-null stellarTxId, TransactionList
     * should render an anchor element linking to Stellar Expert testnet explorer.
     *
     * On unfixed code, no such link exists.
     *
     * **Validates: Requirements 2.4**
     */
    it('TransactionList should render explorer link for transactions with stellarTxId', () => {
      const testTxId = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
      const transactions = [
        {
          id: 'tx-1',
          stellarTxId: testTxId,
          senderAddress: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV',
          recipientAddress: 'GBCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW',
          senderId: 'user-1',
          recipientId: 'user-2',
          amount: '100.00',
          memo: null,
          status: 'COMPLETED' as const,
          createdAt: new Date().toISOString(),
        },
      ];

      const { container } = render(
        React.createElement(TransactionList, {
          transactions,
          currentUserId: 'user-1',
        })
      );

      // Find an anchor element with href pointing to stellar.expert
      const expectedHref = `https://stellar.expert/explorer/testnet/tx/${testTxId}`;
      const explorerLink = container.querySelector(`a[href="${expectedHref}"]`);

      expect(explorerLink).not.toBeNull();
      expect(explorerLink!.getAttribute('target')).toBe('_blank');
      expect(explorerLink!.getAttribute('rel')).toBe('noopener noreferrer');
    });
  });
});
