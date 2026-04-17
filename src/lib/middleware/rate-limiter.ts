/**
 * In-memory sliding window rate limiter.
 *
 * Provides a factory function `createRateLimiter` that returns a checker
 * function. Each checker tracks request timestamps per key (IP address or
 * user ID) in a Map-based sliding window.
 *
 * Usage:
 *   const authLimiter = createRateLimiter({ maxRequests: 10, windowMs: 60_000 });
 *   const result = authLimiter.check(clientIp);
 *   if (!result.allowed) { return Response.json(..., { status: 429 }); }
 *
 * Configuration per the design:
 * - Auth endpoints: 10 requests per IP per minute
 * - Payment endpoints: 20 requests per user per minute
 *
 * The sliding window approach removes expired timestamps on each check,
 * so memory usage is bounded by active keys × window size.
 *
 * NOTE: This is an in-memory implementation suitable for single-process
 * deployments. For multi-process or serverless environments, replace the
 * Map store with Redis.
 *
 * @see Requirements 13.1 (auth rate limit: 10 req/IP/min)
 * @see Requirements 13.2 (payment rate limit: 20 req/user/min)
 */

export interface RateLimiterConfig {
  /** Maximum number of requests allowed within the window. */
  maxRequests: number;
  /** Window duration in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  /** Whether the request is allowed. */
  allowed: boolean;
  /** Number of remaining requests in the current window. */
  remaining: number;
  /** Unix timestamp (ms) when the window resets for this key. */
  resetAt: number;
}

export interface RateLimiter {
  /** Check whether a request for the given key is allowed. */
  check(key: string): RateLimitResult;
  /** Reset the rate limiter state for a given key (useful for testing). */
  reset(key: string): void;
  /** Clear all stored rate limit data. */
  clear(): void;
}

/**
 * Creates a sliding window rate limiter.
 *
 * @param config - Rate limiter configuration.
 * @returns A RateLimiter instance with `check`, `reset`, and `clear` methods.
 */
export function createRateLimiter(config: RateLimiterConfig): RateLimiter {
  const { maxRequests, windowMs } = config;

  // Map from key → array of request timestamps (epoch ms).
  // Timestamps are pruned on each check() call, so memory usage is
  // bounded by (active keys × maxRequests) rather than growing unbounded.
  const store = new Map<string, number[]>();

  function check(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - windowMs;

    // Get existing timestamps for this key, or start fresh.
    let timestamps = store.get(key) || [];

    // Remove timestamps that have fallen outside the sliding window.
    timestamps = timestamps.filter((ts) => ts > windowStart);

    if (timestamps.length >= maxRequests) {
      // Rate limit exceeded — calculate when the earliest entry expires.
      const oldestInWindow = timestamps[0];
      const resetAt = oldestInWindow + windowMs;

      // Save the pruned timestamps back (no new entry added).
      store.set(key, timestamps);

      return {
        allowed: false,
        remaining: 0,
        resetAt,
      };
    }

    // Request is allowed — record this timestamp.
    timestamps.push(now);
    store.set(key, timestamps);

    return {
      allowed: true,
      remaining: maxRequests - timestamps.length,
      resetAt: now + windowMs,
    };
  }

  function reset(key: string): void {
    store.delete(key);
  }

  function clear(): void {
    store.clear();
  }

  return { check, reset, clear };
}

// ── Pre-configured rate limiters ────────────────────────────────────────

/**
 * Rate limiter for authentication endpoints.
 * 10 requests per IP per minute (Requirement 13.1).
 */
export const authRateLimiter = createRateLimiter({
  maxRequests: 10,
  windowMs: 60_000,
});

/**
 * Rate limiter for payment endpoints.
 * 20 requests per user per minute (Requirement 13.2).
 */
export const paymentRateLimiter = createRateLimiter({
  maxRequests: 20,
  windowMs: 60_000,
});
