/**
 * Unit tests for the sliding window rate limiter.
 *
 * Validates:
 * - Requests within limit are allowed
 * - Requests exceeding limit return 429-style rejection
 * - Window expiry resets the counter
 * - Pre-configured auth and payment limiters use correct thresholds
 *
 * @see Requirements 13.1 (auth: 10 req/IP/min)
 * @see Requirements 13.2 (payment: 20 req/user/min)
 */

import {
  createRateLimiter,
  authRateLimiter,
  paymentRateLimiter,
} from '../rate-limiter';

describe('Rate Limiter', () => {
  describe('createRateLimiter', () => {
    it('allows requests up to the max limit', () => {
      const limiter = createRateLimiter({ maxRequests: 3, windowMs: 60_000 });

      expect(limiter.check('ip1').allowed).toBe(true);
      expect(limiter.check('ip1').allowed).toBe(true);
      expect(limiter.check('ip1').allowed).toBe(true);
    });

    it('rejects requests after the max limit is reached', () => {
      const limiter = createRateLimiter({ maxRequests: 3, windowMs: 60_000 });

      limiter.check('ip1');
      limiter.check('ip1');
      limiter.check('ip1');

      const result = limiter.check('ip1');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('tracks remaining requests correctly', () => {
      const limiter = createRateLimiter({ maxRequests: 5, windowMs: 60_000 });

      expect(limiter.check('ip1').remaining).toBe(4);
      expect(limiter.check('ip1').remaining).toBe(3);
      expect(limiter.check('ip1').remaining).toBe(2);
      expect(limiter.check('ip1').remaining).toBe(1);
      expect(limiter.check('ip1').remaining).toBe(0);
    });

    it('tracks different keys independently', () => {
      const limiter = createRateLimiter({ maxRequests: 2, windowMs: 60_000 });

      limiter.check('ip1');
      limiter.check('ip1');
      expect(limiter.check('ip1').allowed).toBe(false);

      // Different key should still be allowed.
      expect(limiter.check('ip2').allowed).toBe(true);
    });

    it('provides a resetAt timestamp', () => {
      const limiter = createRateLimiter({ maxRequests: 1, windowMs: 60_000 });

      const result = limiter.check('ip1');
      expect(result.resetAt).toBeGreaterThan(Date.now() - 1000);
      expect(result.resetAt).toBeLessThanOrEqual(Date.now() + 60_000 + 100);
    });

    it('allows requests again after the window expires', () => {
      const limiter = createRateLimiter({ maxRequests: 2, windowMs: 100 });

      limiter.check('ip1');
      limiter.check('ip1');
      expect(limiter.check('ip1').allowed).toBe(false);

      // Wait for the window to expire.
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(limiter.check('ip1').allowed).toBe(true);
          resolve();
        }, 150);
      });
    });

    it('reset() clears state for a specific key', () => {
      const limiter = createRateLimiter({ maxRequests: 1, windowMs: 60_000 });

      limiter.check('ip1');
      expect(limiter.check('ip1').allowed).toBe(false);

      limiter.reset('ip1');
      expect(limiter.check('ip1').allowed).toBe(true);
    });

    it('clear() clears all state', () => {
      const limiter = createRateLimiter({ maxRequests: 1, windowMs: 60_000 });

      limiter.check('ip1');
      limiter.check('ip2');

      limiter.clear();

      expect(limiter.check('ip1').allowed).toBe(true);
      expect(limiter.check('ip2').allowed).toBe(true);
    });

    it('rejected request does not add a new timestamp', () => {
      const limiter = createRateLimiter({ maxRequests: 2, windowMs: 60_000 });

      limiter.check('ip1'); // 1
      limiter.check('ip1'); // 2
      limiter.check('ip1'); // rejected — should NOT become 3
      limiter.check('ip1'); // rejected — still 2 entries

      // After reset, we should get 2 allowed again (not fewer).
      limiter.reset('ip1');
      expect(limiter.check('ip1').allowed).toBe(true);
      expect(limiter.check('ip1').allowed).toBe(true);
      expect(limiter.check('ip1').allowed).toBe(false);
    });
  });

  describe('pre-configured limiters', () => {
    afterEach(() => {
      authRateLimiter.clear();
      paymentRateLimiter.clear();
    });

    it('authRateLimiter allows 10 requests per key', () => {
      for (let i = 0; i < 10; i++) {
        expect(authRateLimiter.check('127.0.0.1').allowed).toBe(true);
      }
      expect(authRateLimiter.check('127.0.0.1').allowed).toBe(false);
    });

    it('paymentRateLimiter allows 20 requests per key', () => {
      for (let i = 0; i < 20; i++) {
        expect(paymentRateLimiter.check('user_1').allowed).toBe(true);
      }
      expect(paymentRateLimiter.check('user_1').allowed).toBe(false);
    });
  });
});
