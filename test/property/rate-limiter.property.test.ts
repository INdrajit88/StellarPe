/**
 * Property-based tests for the sliding window rate limiter.
 *
 * Feature: stellar-pay, Property 31: Auth endpoint rate limiting
 * Feature: stellar-pay, Property 32: Payment endpoint rate limiting
 *
 * Validates: Requirements 13.1, 13.2
 *
 * Uses fast-check to generate arbitrary IP/user-ID strings and verify
 * that the rate limiter enforces the configured thresholds across many
 * randomized keys.
 */

import fc from 'fast-check';
import { createRateLimiter } from '@/lib/middleware/rate-limiter';

// ── Generators ──────────────────────────────────────────────────────────

/** Generates an arbitrary non-empty IP-like string key. */
const arbitraryIp = fc
  .tuple(
    fc.integer({ min: 1, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
  )
  .map(([a, b, c, d]) => `${a}.${b}.${c}.${d}`);

/** Generates an arbitrary non-empty user ID string. */
const arbitraryUserId = fc
  .stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{2,29}$/)
  .filter((s) => s.length >= 3 && s.length <= 30)
  .map((s) => `user_${s}`);

// ── Tests ───────────────────────────────────────────────────────────────

describe('Rate Limiter — Property Tests', () => {
  // ── Property 31: Auth endpoint rate limiting ──────────────────────────

  describe('Property 31: Auth endpoint rate limiting', () => {
    // Feature: stellar-pay, Property 31: Auth endpoint rate limiting
    it('blocks the 11th request for any IP when maxRequests=10', () => {
      /**
       * Validates: Requirements 13.1
       *
       * For any IP string, after exactly 10 calls with maxRequests=10,
       * the 11th call should return allowed: false. All first 10 calls
       * should return allowed: true.
       */
      fc.assert(
        fc.property(arbitraryIp, (ip) => {
          const limiter = createRateLimiter({ maxRequests: 10, windowMs: 60_000 });

          // First 10 requests should all be allowed.
          for (let i = 0; i < 10; i++) {
            const result = limiter.check(ip);
            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(9 - i);
          }

          // The 11th request should be rejected.
          const rejected = limiter.check(ip);
          expect(rejected.allowed).toBe(false);
          expect(rejected.remaining).toBe(0);

          return true;
        }),
        { numRuns: 20 },
      );
    });

    // Feature: stellar-pay, Property 31: Auth endpoint rate limiting
    it('does not add timestamps for rejected requests', () => {
      /**
       * Validates: Requirements 13.1
       *
       * After being rejected, additional requests should still be
       * rejected but should not inflate the counter — resetting should
       * restore the full quota.
       */
      fc.assert(
        fc.property(arbitraryIp, (ip) => {
          const limiter = createRateLimiter({ maxRequests: 10, windowMs: 60_000 });

          // Exhaust the limit.
          for (let i = 0; i < 10; i++) {
            limiter.check(ip);
          }

          // Fire several more rejected requests.
          for (let i = 0; i < 5; i++) {
            expect(limiter.check(ip).allowed).toBe(false);
          }

          // After reset, the full 10 should be available again.
          limiter.reset(ip);
          for (let i = 0; i < 10; i++) {
            expect(limiter.check(ip).allowed).toBe(true);
          }
          expect(limiter.check(ip).allowed).toBe(false);

          return true;
        }),
        { numRuns: 20 },
      );
    });
  });

  // ── Property 32: Payment endpoint rate limiting ───────────────────────

  describe('Property 32: Payment endpoint rate limiting', () => {
    // Feature: stellar-pay, Property 32: Payment endpoint rate limiting
    it('blocks the 21st request for any user ID when maxRequests=20', () => {
      /**
       * Validates: Requirements 13.2
       *
       * For any user ID string, after exactly 20 calls with maxRequests=20,
       * the 21st call should return allowed: false. All first 20 calls
       * should return allowed: true.
       */
      fc.assert(
        fc.property(arbitraryUserId, (userId) => {
          const limiter = createRateLimiter({ maxRequests: 20, windowMs: 60_000 });

          // First 20 requests should all be allowed.
          for (let i = 0; i < 20; i++) {
            const result = limiter.check(userId);
            expect(result.allowed).toBe(true);
            expect(result.remaining).toBe(19 - i);
          }

          // The 21st request should be rejected.
          const rejected = limiter.check(userId);
          expect(rejected.allowed).toBe(false);
          expect(rejected.remaining).toBe(0);

          return true;
        }),
        { numRuns: 20 },
      );
    });

    // Feature: stellar-pay, Property 32: Payment endpoint rate limiting
    it('tracks different user IDs independently', () => {
      /**
       * Validates: Requirements 13.2
       *
       * For any two distinct user IDs, exhausting the rate limit for one
       * should not affect the other.
       */
      fc.assert(
        fc.property(
          fc.tuple(arbitraryUserId, arbitraryUserId).filter(([a, b]) => a !== b),
          ([userA, userB]) => {
            const limiter = createRateLimiter({ maxRequests: 20, windowMs: 60_000 });

            // Exhaust the limit for userA.
            for (let i = 0; i < 20; i++) {
              limiter.check(userA);
            }
            expect(limiter.check(userA).allowed).toBe(false);

            // userB should still have its full quota.
            for (let i = 0; i < 20; i++) {
              expect(limiter.check(userB).allowed).toBe(true);
            }
            expect(limiter.check(userB).allowed).toBe(false);

            return true;
          },
        ),
        { numRuns: 20 },
      );
    });
  });
});
