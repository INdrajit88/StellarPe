/**
 * Property-based tests for QRService.
 *
 * Feature: stellar-pay, Property 22: QR code round-trip
 * Feature: stellar-pay, Property 23: QR code format and dimensions
 * Feature: stellar-pay, Property 24: Invalid Stellar address rejected by QR parser
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.5, 7.6
 *
 * Uses fast-check to generate arbitrary inputs and verify QRService invariants
 * across many randomized cases.
 */

import fc from 'fast-check';
import { jest } from '@jest/globals';

// ─── Mock setup ──────────────────────────────────────────────────────────────

const mockToBuffer = jest.fn();

jest.mock('qrcode', () => ({
  __esModule: true,
  default: {
    toBuffer: (...args: unknown[]) => mockToBuffer(...args),
  },
}));

// Import the module under test — mocks are already in place
import {
  generateStaticQR,
  generateDynamicQR,
  parseQRPayload,
} from '@/lib/services/qr.service';

// ─── Generators ──────────────────────────────────────────────────────────────

/** Valid base32 characters used in Stellar public keys (A-Z, 2-7). */
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Generates a valid Stellar address: 'G' followed by 55 random base32 chars.
 */
const validStellarAddress = fc
  .array(
    fc.integer({ min: 0, max: BASE32_CHARS.length - 1 }).map((i) => BASE32_CHARS[i]),
    { minLength: 55, maxLength: 55 }
  )
  .map((chars) => 'G' + chars.join(''));

/**
 * Generates a positive amount string (e.g. "10", "0.5", "123.456").
 */
const amountArb = fc
  .tuple(
    fc.integer({ min: 0, max: 999999 }),
    fc.integer({ min: 0, max: 9999999 })
  )
  .map(([whole, frac]) => (frac > 0 ? `${whole}.${frac}` : `${whole}`));

/**
 * Generates an optional description string (ASCII printable, reasonable length).
 */
const descriptionArb = fc.option(
  fc.string({ minLength: 1, maxLength: 100 }),
  { nil: undefined }
);

// ─── Setup ───────────────────────────────────────────────────────────────────

const FAKE_PNG_BUFFER = Buffer.from('fake-png-data');

beforeEach(() => {
  jest.clearAllMocks();
  mockToBuffer.mockResolvedValue(FAKE_PNG_BUFFER);
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('QRService — Property Tests', () => {
  // ── Property 22: QR code round-trip ─────────────────────────────────

  describe('Property 22: QR code round-trip', () => {
    // Feature: stellar-pay, Property 22: QR code round-trip
    it('static QR: generate payload → parse returns original address', async () => {
      /**
       * Validates: Requirements 7.1
       *
       * For any valid Stellar address, generating a static QR and then
       * parsing the JSON payload that was passed to qrcode.toBuffer
       * should return the original address unchanged.
       */
      await fc.assert(
        fc.asyncProperty(validStellarAddress, async (address) => {
          await generateStaticQR(address);

          // Extract the JSON payload passed to qrcode.toBuffer
          const payload = mockToBuffer.mock.calls[
            mockToBuffer.mock.calls.length - 1
          ][0] as string;

          const parsed = parseQRPayload(payload);
          expect(parsed.address).toBe(address);
          expect(parsed.amount).toBeUndefined();
          expect(parsed.description).toBeUndefined();

          mockToBuffer.mockClear();
          mockToBuffer.mockResolvedValue(FAKE_PNG_BUFFER);
        }),
        { numRuns: 20 }
      );
    });

    // Feature: stellar-pay, Property 22: QR code round-trip
    it('dynamic QR: generate payload → parse returns original address, amount, and description', async () => {
      /**
       * Validates: Requirements 7.2
       *
       * For any valid Stellar address, amount, and optional description,
       * generating a dynamic QR and then parsing the JSON payload should
       * return the original values unchanged.
       */
      await fc.assert(
        fc.asyncProperty(
          validStellarAddress,
          amountArb,
          descriptionArb,
          async (address, amount, description) => {
            await generateDynamicQR(address, amount, description);

            // Extract the JSON payload passed to qrcode.toBuffer
            const payload = mockToBuffer.mock.calls[
              mockToBuffer.mock.calls.length - 1
            ][0] as string;

            const parsed = parseQRPayload(payload);
            expect(parsed.address).toBe(address);
            expect(parsed.amount).toBe(amount);

            if (description !== undefined) {
              expect(parsed.description).toBe(description);
            } else {
              expect(parsed.description).toBeUndefined();
            }

            mockToBuffer.mockClear();
            mockToBuffer.mockResolvedValue(FAKE_PNG_BUFFER);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  // ── Property 23: QR code format and dimensions ──────────────────────

  describe('Property 23: QR code format and dimensions', () => {
    // Feature: stellar-pay, Property 23: QR code format and dimensions
    it('qrcode.toBuffer is called with PNG type and width >= 256 for static QR', async () => {
      /**
       * Validates: Requirements 7.3
       *
       * For any valid Stellar address, generating a static QR should call
       * qrcode.toBuffer with options specifying PNG format and width >= 256.
       */
      await fc.assert(
        fc.asyncProperty(validStellarAddress, async (address) => {
          await generateStaticQR(address);

          const callArgs = mockToBuffer.mock.calls[
            mockToBuffer.mock.calls.length - 1
          ];
          const options = callArgs[1] as { type: string; width: number };

          expect(options.type).toBe('png');
          expect(options.width).toBeGreaterThanOrEqual(256);

          mockToBuffer.mockClear();
          mockToBuffer.mockResolvedValue(FAKE_PNG_BUFFER);
        }),
        { numRuns: 20 }
      );
    });

    // Feature: stellar-pay, Property 23: QR code format and dimensions
    it('qrcode.toBuffer is called with PNG type and width >= 256 for dynamic QR', async () => {
      /**
       * Validates: Requirements 7.3
       *
       * For any valid Stellar address and amount, generating a dynamic QR
       * should call qrcode.toBuffer with options specifying PNG format
       * and width >= 256.
       */
      await fc.assert(
        fc.asyncProperty(
          validStellarAddress,
          amountArb,
          async (address, amount) => {
            await generateDynamicQR(address, amount);

            const callArgs = mockToBuffer.mock.calls[
              mockToBuffer.mock.calls.length - 1
            ];
            const options = callArgs[1] as { type: string; width: number };

            expect(options.type).toBe('png');
            expect(options.width).toBeGreaterThanOrEqual(256);

            mockToBuffer.mockClear();
            mockToBuffer.mockResolvedValue(FAKE_PNG_BUFFER);
          }
        ),
        { numRuns: 20 }
      );
    });
  });

  // ── Property 24: Invalid Stellar address rejected by QR parser ──────

  describe('Property 24: Invalid Stellar address rejected by QR parser', () => {
    // Feature: stellar-pay, Property 24: Invalid Stellar address rejected by QR parser
    it('rejects addresses with wrong length (not 56 chars)', () => {
      /**
       * Validates: Requirements 7.5, 7.6
       *
       * For any string length that is NOT 56, a string starting with 'G'
       * followed by base32 chars should be rejected by parseQRPayload.
       */
      fc.assert(
        fc.property(
          fc
            .integer({ min: 1, max: 200 })
            .filter((len) => len !== 56)
            .chain((len) =>
              fc
                .array(
                  fc
                    .integer({ min: 0, max: BASE32_CHARS.length - 1 })
                    .map((i) => BASE32_CHARS[i]),
                  { minLength: Math.max(len - 1, 0), maxLength: Math.max(len - 1, 0) }
                )
                .map((chars) => 'G' + chars.join(''))
            ),
          (badAddress) => {
            const data = JSON.stringify({ address: badAddress });
            expect(() => parseQRPayload(data)).toThrow(/Invalid Stellar address/);
          }
        ),
        { numRuns: 20 }
      );
    });

    // Feature: stellar-pay, Property 24: Invalid Stellar address rejected by QR parser
    it('rejects addresses that do not start with G', () => {
      /**
       * Validates: Requirements 7.5, 7.6
       *
       * For any 56-char string that does NOT start with 'G' but uses
       * valid base32 characters, parseQRPayload should reject it.
       */
      fc.assert(
        fc.property(
          fc
            .integer({ min: 0, max: BASE32_CHARS.length - 1 })
            .filter((i) => BASE32_CHARS[i] !== 'G')
            .map((i) => BASE32_CHARS[i])
            .chain((firstChar) =>
              fc
                .array(
                  fc
                    .integer({ min: 0, max: BASE32_CHARS.length - 1 })
                    .map((i) => BASE32_CHARS[i]),
                  { minLength: 55, maxLength: 55 }
                )
                .map((chars) => firstChar + chars.join(''))
            ),
          (badAddress) => {
            const data = JSON.stringify({ address: badAddress });
            expect(() => parseQRPayload(data)).toThrow(/Invalid Stellar address/);
          }
        ),
        { numRuns: 20 }
      );
    });

    // Feature: stellar-pay, Property 24: Invalid Stellar address rejected by QR parser
    it('rejects addresses with invalid base32 characters', () => {
      /**
       * Validates: Requirements 7.5, 7.6
       *
       * For any 56-char string starting with 'G' that contains at least
       * one character outside the base32 alphabet (A-Z, 2-7),
       * parseQRPayload should reject it.
       */
      const INVALID_CHARS = '01890abcdefghijklmnopqrstuvwxyz!@#$%';

      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 54 }),
          fc.integer({ min: 0, max: INVALID_CHARS.length - 1 }),
          fc.array(
            fc
              .integer({ min: 0, max: BASE32_CHARS.length - 1 })
              .map((i) => BASE32_CHARS[i]),
            { minLength: 55, maxLength: 55 }
          ),
          (insertPos, invalidCharIdx, base32Chars) => {
            const chars = [...base32Chars];
            chars[insertPos] = INVALID_CHARS[invalidCharIdx];
            const badAddress = 'G' + chars.join('');

            const data = JSON.stringify({ address: badAddress });
            expect(() => parseQRPayload(data)).toThrow(/Invalid Stellar address/);
          }
        ),
        { numRuns: 20 }
      );
    });

    // Feature: stellar-pay, Property 24: Invalid Stellar address rejected by QR parser
    it('rejects arbitrary non-Stellar strings wrapped in QR JSON', () => {
      /**
       * Validates: Requirements 7.5, 7.6
       *
       * For any random string that does NOT match the Stellar address
       * pattern (G + 55 base32 chars), wrapping it in a QR JSON payload
       * and calling parseQRPayload should throw.
       */
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }).filter((s) => {
            // Filter out strings that happen to be valid Stellar addresses
            return !/^G[A-Z2-7]{55}$/.test(s);
          }),
          (badAddress) => {
            const data = JSON.stringify({ address: badAddress });
            expect(() => parseQRPayload(data)).toThrow();
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});
