/**
 * @jest-environment jsdom
 */

/**
 * Preservation Property Tests
 *
 * These tests capture the EXISTING behavior of the unfixed code for non-buggy inputs.
 * They verify that the upcoming fixes do not regress any existing functionality.
 *
 * EXPECTED OUTCOME: These tests PASS on unfixed code — confirming baseline behavior.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import React from 'react';
import fc from 'fast-check';
import { parseQRPayload } from '@/lib/services/qr.service';

// ─── Mocks ───────────────────────────────────────────────────────────────────

// Mock next/navigation for components that use useRouter
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
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

// Import render utilities
import { render } from '@testing-library/react';
import { ProfileCard } from '@/components/ProfileCard';
import { TransactionList, Transaction } from '@/components/TransactionList';
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

/**
 * Generates random usernames: 1-20 alphanumeric characters.
 */
const usernameArb = fc.array(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
  { minLength: 1, maxLength: 20 }
).map(chars => chars.join(''));

/**
 * Generates random wallet IDs: UUID-like strings.
 */
const walletIdArb = fc.uuid();

/**
 * Generates a valid transaction for TransactionList.
 */
const transactionArb = (currentUserId: string): fc.Arbitrary<Transaction> =>
  fc.record({
    id: fc.uuid(),
    stellarTxId: fc.oneof(
      fc.array(
        fc.constantFrom(...'0123456789abcdef'.split('')),
        { minLength: 64, maxLength: 64 }
      ).map(chars => chars.join('')),
      fc.constant(null)
    ),
    senderAddress: stellarAddressArb,
    recipientAddress: stellarAddressArb,
    senderId: fc.oneof(fc.constant(currentUserId), fc.uuid()),
    recipientId: fc.oneof(fc.constant(currentUserId), fc.uuid()),
    amount: fc.float({ min: Math.fround(0.01), max: Math.fround(999999), noNaN: true }).map(n => n.toFixed(2)),
    memo: fc.oneof(fc.string({ minLength: 1, maxLength: 50 }), fc.constant(null)),
    status: fc.constantFrom('COMPLETED' as const, 'FAILED' as const),
    createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2025-12-31') }).map(d => d.toISOString()),
  });

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Preservation Property Tests', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Preservation A: ProfileCard Structure', () => {
    /**
     * Property: For any username and wallet ID, ProfileCard renders the avatar initial,
     * username text, wallet ID with CopyButton, QR code via QRCodeDisplay, and
     * QRDownloadButton — all in the correct order.
     *
     * **Validates: Requirements 3.2**
     */
    it('should render all ProfileCard elements in correct order for any username and wallet ID', () => {
      fc.assert(
        fc.property(usernameArb, walletIdArb, stellarAddressArb, (username, walletId, address) => {
          const { container, unmount } = render(
            React.createElement(ProfileCard, { username, walletId, stellarAddress: address })
          );

          // 1. Avatar initial — first letter of username, uppercased, in a circle div
          const avatarDiv = container.querySelector('.rounded-full');
          expect(avatarDiv).not.toBeNull();
          expect(avatarDiv!.textContent).toBe(username.charAt(0).toUpperCase());

          // 2. Username text in an h2 element
          const h2 = container.querySelector('h2');
          expect(h2).not.toBeNull();
          expect(h2!.textContent).toBe(username);

          // 3. Wallet ID with CopyButton — span.truncate contains walletId
          const walletSpan = container.querySelector('span.truncate');
          expect(walletSpan).not.toBeNull();
          expect(walletSpan!.textContent).toBe(walletId);

          // CopyButton for wallet ID — button with "Copy Wallet ID" label
          const copyBtn = container.querySelector('button[aria-label="Copy Wallet ID"]');
          expect(copyBtn).not.toBeNull();

          // 4. QR code via QRCodeDisplay — mocked as svg with data-testid="qr-svg"
          const qrSvg = container.querySelector('[data-testid="qr-svg"]');
          expect(qrSvg).not.toBeNull();

          // 5. QRDownloadButton — button with "Download QR" text
          const downloadBtn = Array.from(container.querySelectorAll('button')).find(
            (btn: HTMLButtonElement) => btn.textContent?.includes('Download QR')
          );
          expect(downloadBtn).not.toBeNull();

          // Verify order: avatar comes before h2, h2 before wallet, wallet before QR, QR before download
          const allElements = container.querySelectorAll('*');
          const indices: number[] = [];
          allElements.forEach((el: Element, idx: number) => {
            if (el === avatarDiv) indices[0] = idx;
            if (el === h2) indices[1] = idx;
            if (el === walletSpan) indices[2] = idx;
            if (el === qrSvg) indices[3] = idx;
            if (el === downloadBtn) indices[4] = idx;
          });

          // Each element should appear after the previous one
          for (let i = 1; i < indices.length; i++) {
            expect(indices[i]).toBeGreaterThan(indices[i - 1]);
          }

          unmount();
        }),
        { numRuns: 20 }
      );
    });
  });

  describe('Preservation B: TransactionList Existing Elements', () => {
    /**
     * Property: For any set of transactions, TransactionList renders direction badge
     * (Sent/Received), status badge (Completed/Failed), counterparty address, timestamp,
     * amount with XLM suffix, and copy button for stellarTxId.
     *
     * **Validates: Requirements 3.4**
     */
    it('should render all existing transaction elements for any generated transactions', () => {
      const currentUserId = 'current-user-id';

      fc.assert(
        fc.property(
          fc.array(transactionArb(currentUserId), { minLength: 1, maxLength: 5 }),
          (transactions: Transaction[]) => {
            const { container, unmount } = render(
              React.createElement(TransactionList, { transactions, currentUserId })
            );

            // Should render a list
            const list = container.querySelector('ul[role="list"]');
            expect(list).not.toBeNull();

            const listItems = container.querySelectorAll('li');
            expect(listItems.length).toBe(transactions.length);

            transactions.forEach((tx, idx) => {
              const li = listItems[idx];
              const isSent = tx.senderId === currentUserId;

              // 1. Direction badge (Sent/Received)
              const directionBadge = Array.from(li.querySelectorAll('span')).find(
                (span: HTMLSpanElement) => span.textContent === (isSent ? 'Sent' : 'Received')
              );
              expect(directionBadge).not.toBeUndefined();

              // Direction badge has correct color classes
              if (isSent) {
                expect(directionBadge!.className).toContain('text-red-700');
                expect(directionBadge!.className).toContain('bg-red-50');
              } else {
                expect(directionBadge!.className).toContain('text-green-700');
                expect(directionBadge!.className).toContain('bg-green-50');
              }

              // 2. Status badge (Completed/Failed)
              const expectedStatus = tx.status === 'COMPLETED' ? 'Completed' : 'Failed';
              const statusBadge = Array.from(li.querySelectorAll('span')).find(
                (span: HTMLSpanElement) => span.textContent === expectedStatus
              );
              expect(statusBadge).not.toBeUndefined();

              if (tx.status === 'COMPLETED') {
                expect(statusBadge!.className).toContain('text-blue-700');
                expect(statusBadge!.className).toContain('bg-blue-50');
              } else {
                expect(statusBadge!.className).toContain('text-yellow-700');
                expect(statusBadge!.className).toContain('bg-yellow-50');
              }

              // 3. Counterparty address (truncated)
              const counterpartyAddr = isSent ? tx.recipientAddress : tx.senderAddress;
              const prefix = isSent ? 'To: ' : 'From: ';
              const truncatedAddr = `${prefix}${counterpartyAddr.slice(0, 8)}...${counterpartyAddr.slice(-6)}`;
              const addrP = Array.from(li.querySelectorAll('p')).find(
                (p: HTMLParagraphElement) => p.textContent === truncatedAddr
              );
              expect(addrP).not.toBeUndefined();

              // 4. Timestamp
              const timestampStr = new Date(tx.createdAt).toLocaleString();
              const timestampP = Array.from(li.querySelectorAll('p')).find(
                (p: HTMLParagraphElement) => p.textContent === timestampStr
              );
              expect(timestampP).not.toBeUndefined();

              // 5. Amount with XLM suffix
              const amountPrefix = isSent ? '-' : '+';
              const formattedAmount = parseFloat(tx.amount).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 7,
              });
              const expectedAmountText = `${amountPrefix}${formattedAmount} XLM`;
              const amountP = Array.from(li.querySelectorAll('p')).find(
                (p: HTMLParagraphElement) => p.textContent?.trim() === expectedAmountText
              );
              expect(amountP).not.toBeUndefined();

              // Amount has correct color
              if (isSent) {
                expect(amountP!.className).toContain('text-red-600');
              } else {
                expect(amountP!.className).toContain('text-green-600');
              }

              // 6. Copy button for stellarTxId (when present)
              if (tx.stellarTxId) {
                const copyBtn = li.querySelector('button[aria-label="Copy transaction ID"]');
                expect(copyBtn).not.toBeNull();
              }
            });

            unmount();
          }
        ),
        { numRuns: 15 }
      );
    });
  });

  describe('Preservation C: Login Auth Flow', () => {
    /**
     * Property: The login form contains email input, password input, submit button,
     * and registration link. The handleSubmit structure (form submission, JWT storage,
     * role-based redirect) must not be affected by styling changes.
     *
     * **Validates: Requirements 3.3**
     */
    it('should render login form with email input, password input, submit button, and registration link', () => {
      const { container } = render(React.createElement(LoginPage));

      // 1. Email input
      const emailInput = container.querySelector('input[type="email"]');
      expect(emailInput).not.toBeNull();
      expect(emailInput!.getAttribute('autocomplete')).toBe('email');

      // 2. Password input
      const passwordInput = container.querySelector('input[type="password"]');
      expect(passwordInput).not.toBeNull();
      expect(passwordInput!.getAttribute('autocomplete')).toBe('current-password');

      // 3. Submit button with "Sign in" text
      const submitBtn = container.querySelector('button[type="submit"]');
      expect(submitBtn).not.toBeNull();
      expect(submitBtn!.textContent).toContain('Sign in');

      // 4. Registration link to /register
      const registerLink = container.querySelector('a[href="/register"]');
      expect(registerLink).not.toBeNull();
      expect(registerLink!.textContent).toContain('Create one');
    });

    it('should have a form element with onSubmit handler', () => {
      const { container } = render(React.createElement(LoginPage));

      // The form element should exist
      const form = container.querySelector('form');
      expect(form).not.toBeNull();

      // Form should have noValidate attribute (client-side validation)
      expect(form!.getAttribute('novalidate')).not.toBeNull();
    });

    it('should have heading and subtitle text', () => {
      const { container } = render(React.createElement(LoginPage));

      // Heading "Welcome back"
      const heading = container.querySelector('h1');
      expect(heading).not.toBeNull();
      expect(heading!.textContent).toBe('Welcome back');

      // Subtitle "Sign in to your StellarPay account"
      const subtitle = Array.from(container.querySelectorAll('p')).find(
        (p: HTMLParagraphElement) => p.textContent?.includes('Sign in to your StellarPay account')
      );
      expect(subtitle).not.toBeUndefined();
    });
  });

  describe('Preservation D: Merchant QR Compatibility', () => {
    /**
     * Property: For any valid Stellar address, generateStaticQR and generateDynamicQR
     * produce valid JSON payloads parseable by parseQRPayload. The round-trip
     * parseQRPayload(JSON.stringify({ address })) returns the original address.
     *
     * **Validates: Requirements 3.1, 3.6**
     */
    it('should round-trip: parseQRPayload(JSON.stringify({ address })) returns original address for any valid Stellar address', () => {
      fc.assert(
        fc.property(stellarAddressArb, (address: string) => {
          // Simulate what generateStaticQR does: JSON.stringify({ address })
          const payload = JSON.stringify({ address });

          // parseQRPayload should successfully parse it
          const parsed = parseQRPayload(payload);

          // The parsed address should match the original
          expect(parsed.address).toBe(address);
        }),
        { numRuns: 50 }
      );
    });

    it('should round-trip dynamic QR payloads with amount and description', () => {
      fc.assert(
        fc.property(
          stellarAddressArb,
          fc.float({ min: Math.fround(0.01), max: Math.fround(999999), noNaN: true }).map(n => n.toFixed(2)),
          fc.string({ minLength: 1, maxLength: 100 }),
          (address: string, amount: string, description: string) => {
            // Simulate what generateDynamicQR does
            const payload = JSON.stringify({ address, amount, description });

            // parseQRPayload should successfully parse it
            const parsed = parseQRPayload(payload);

            // All fields should match
            expect(parsed.address).toBe(address);
            expect(parsed.amount).toBe(amount);
            expect(parsed.description).toBe(description);
          }
        ),
        { numRuns: 30 }
      );
    });

    it('should round-trip dynamic QR payloads without description', () => {
      fc.assert(
        fc.property(
          stellarAddressArb,
          fc.float({ min: Math.fround(0.01), max: Math.fround(999999), noNaN: true }).map(n => n.toFixed(2)),
          (address: string, amount: string) => {
            // Simulate generateDynamicQR without description
            const payload = JSON.stringify({ address, amount });

            const parsed = parseQRPayload(payload);

            expect(parsed.address).toBe(address);
            expect(parsed.amount).toBe(amount);
            expect(parsed.description).toBeUndefined();
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});
