/**
 * Property-based tests for NotificationService exponential backoff.
 *
 * Feature: stellar-pay, Property 18: Exponential backoff for Horizon reconnection
 *
 * Validates: Requirements 5.5
 *
 * Uses fast-check to generate arbitrary attempt numbers and verify that
 * the backoff interval follows the formula min(2^N × baseInterval, 30000) ms.
 */

import fc from 'fast-check';
import { calculateBackoff } from '@/lib/services/notification.service';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('NotificationService — Property Tests', () => {
  // ── Property 18: Exponential backoff for Horizon reconnection ─────────────

  describe('Property 18: Exponential backoff for Horizon reconnection', () => {
    // Feature: stellar-pay, Property 18: Exponential backoff for Horizon reconnection
    it('backoff interval equals min(2^N × baseInterval, 30000) for any attempt N', () => {
      /**
       * Validates: Requirements 5.5
       *
       * For any reconnection attempt number N (starting from 0), the backoff
       * interval should equal min(2^N × baseInterval, 30000) milliseconds.
       */
      const baseInterval = 1000;
      const maxInterval = 30_000;

      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }),
          (attempt) => {
            const result = calculateBackoff(attempt, baseInterval, maxInterval);
            const expected = Math.min(Math.pow(2, attempt) * baseInterval, maxInterval);

            expect(result).toBe(expected);

            return true;
          },
        ),
        { numRuns: 100 },
      );
    });

    // Feature: stellar-pay, Property 18: Exponential backoff for Horizon reconnection
    it('backoff interval never exceeds 30 seconds', () => {
      /**
       * Validates: Requirements 5.5
       *
       * For any attempt number, the backoff interval must never exceed
       * the maximum of 30,000 milliseconds.
       */
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000 }),
          (attempt) => {
            const result = calculateBackoff(attempt);
            expect(result).toBeLessThanOrEqual(30_000);
            return true;
          },
        ),
        { numRuns: 100 },
      );
    });

    // Feature: stellar-pay, Property 18: Exponential backoff for Horizon reconnection
    it('backoff interval is monotonically non-decreasing up to the cap', () => {
      /**
       * Validates: Requirements 5.5
       *
       * For any two attempt numbers where a < b, the backoff for attempt b
       * should be greater than or equal to the backoff for attempt a.
       */
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 50 }),
          fc.integer({ min: 0, max: 50 }),
          (a, b) => {
            const lower = Math.min(a, b);
            const higher = Math.max(a, b);

            const backoffLower = calculateBackoff(lower);
            const backoffHigher = calculateBackoff(higher);

            expect(backoffHigher).toBeGreaterThanOrEqual(backoffLower);

            return true;
          },
        ),
        { numRuns: 50 },
      );
    });

    // Feature: stellar-pay, Property 18: Exponential backoff for Horizon reconnection
    it('backoff at attempt 0 equals the base interval', () => {
      /**
       * Validates: Requirements 5.5
       *
       * For any positive base interval, the backoff at attempt 0 should
       * equal exactly the base interval (2^0 × base = base).
       */
      fc.assert(
        fc.property(
          fc.integer({ min: 100, max: 10_000 }),
          (baseInterval) => {
            const result = calculateBackoff(0, baseInterval);
            expect(result).toBe(baseInterval);
            return true;
          },
        ),
        { numRuns: 20 },
      );
    });

    // Feature: stellar-pay, Property 18: Exponential backoff for Horizon reconnection
    it('backoff with custom base and max intervals follows the formula', () => {
      /**
       * Validates: Requirements 5.5
       *
       * For any combination of attempt, baseInterval, and maxInterval,
       * the result should equal min(2^attempt × baseInterval, maxInterval).
       */
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 30 }),
          fc.integer({ min: 100, max: 5000 }),
          fc.integer({ min: 5000, max: 60_000 }),
          (attempt, baseInterval, maxInterval) => {
            const result = calculateBackoff(attempt, baseInterval, maxInterval);
            const expected = Math.min(
              Math.pow(2, attempt) * baseInterval,
              maxInterval,
            );

            expect(result).toBe(expected);
            expect(result).toBeLessThanOrEqual(maxInterval);
            expect(result).toBeGreaterThanOrEqual(baseInterval);

            return true;
          },
        ),
        { numRuns: 50 },
      );
    });
  });
});
