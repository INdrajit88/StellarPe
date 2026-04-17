/**
 * Property-based tests for CSRF protection middleware.
 *
 * Feature: stellar-pay, Property 33: CSRF protection on state-mutating endpoints
 *
 * Validates: Requirements 13.7
 *
 * Uses fast-check to verify that CSRF validation behaves correctly across
 * all HTTP methods and arbitrary token values.
 */

import fc from 'fast-check';
import { validateCsrf, CSRF_HEADER } from '@/lib/middleware/csrf';

// ── Generators ──────────────────────────────────────────────────────────

/** State-mutating HTTP methods that require CSRF protection. */
const stateMutatingMethod = fc.constantFrom('POST', 'PUT', 'DELETE', 'PATCH');

/** Non-mutating HTTP methods that should bypass CSRF checks. */
const nonMutatingMethod = fc.constantFrom('GET', 'HEAD');

/** Generates a valid non-empty, non-whitespace CSRF token string. */
const validCsrfToken = fc
  .string({ minLength: 1, maxLength: 128 })
  .filter((s) => s.trim().length > 0);

/** Generates an invalid (empty or whitespace-only) CSRF token. */
const invalidCsrfToken = fc.constantFrom('', ' ', '  ', '\t', '\n', '   \t  ');

// ── Tests ───────────────────────────────────────────────────────────────

describe('CSRF Protection — Property Tests', () => {
  // ── Property 33: CSRF protection on state-mutating endpoints ──────────

  describe('Property 33: CSRF protection on state-mutating endpoints', () => {
    // Feature: stellar-pay, Property 33: CSRF protection on state-mutating endpoints
    it('returns 403 for any state-mutating method without x-csrf-token', async () => {
      /**
       * Validates: Requirements 13.7
       *
       * For any state-mutating method (POST, PUT, DELETE, PATCH),
       * a request without the x-csrf-token header should return a
       * 403 Response.
       */
      await fc.assert(
        fc.asyncProperty(stateMutatingMethod, async (method) => {
          const request = new Request('http://localhost/api/test', { method });
          const result = validateCsrf(request);

          expect(result).not.toBeNull();
          expect(result).toBeInstanceOf(Response);
          expect(result!.status).toBe(403);

          const body = await result!.json();
          expect(body.error).toBeDefined();
          expect(body.error).toContain('CSRF');

          return true;
        }),
        { numRuns: 20 },
      );
    });

    // Feature: stellar-pay, Property 33: CSRF protection on state-mutating endpoints
    it('returns 403 for any state-mutating method with empty or whitespace-only token', async () => {
      /**
       * Validates: Requirements 13.7
       *
       * For any state-mutating method with an empty or whitespace-only
       * x-csrf-token header, validateCsrf should return a 403 Response.
       */
      await fc.assert(
        fc.asyncProperty(
          stateMutatingMethod,
          invalidCsrfToken,
          async (method, token) => {
            const request = new Request('http://localhost/api/test', {
              method,
              headers: { [CSRF_HEADER]: token },
            });
            const result = validateCsrf(request);

            expect(result).not.toBeNull();
            expect(result).toBeInstanceOf(Response);
            expect(result!.status).toBe(403);

            return true;
          },
        ),
        { numRuns: 20 },
      );
    });

    // Feature: stellar-pay, Property 33: CSRF protection on state-mutating endpoints
    it('returns null for any state-mutating method with a valid x-csrf-token', () => {
      /**
       * Validates: Requirements 13.7
       *
       * For any state-mutating method with a valid (non-empty, non-whitespace)
       * x-csrf-token header, validateCsrf should return null (request passes).
       */
      fc.assert(
        fc.property(stateMutatingMethod, validCsrfToken, (method, token) => {
          const request = new Request('http://localhost/api/test', {
            method,
            headers: { [CSRF_HEADER]: token },
          });
          const result = validateCsrf(request);

          expect(result).toBeNull();

          return true;
        }),
        { numRuns: 20 },
      );
    });

    // Feature: stellar-pay, Property 33: CSRF protection on state-mutating endpoints
    it('returns null for GET and HEAD requests regardless of token presence', () => {
      /**
       * Validates: Requirements 13.7
       *
       * For GET and HEAD requests, validateCsrf should always return null
       * regardless of whether the x-csrf-token header is present.
       */
      fc.assert(
        fc.property(
          nonMutatingMethod,
          fc.option(validCsrfToken, { nil: undefined }),
          (method, token) => {
            const headers: Record<string, string> = {};
            if (token !== undefined) {
              headers[CSRF_HEADER] = token;
            }

            const request = new Request('http://localhost/api/test', {
              method,
              headers,
            });
            const result = validateCsrf(request);

            expect(result).toBeNull();

            return true;
          },
        ),
        { numRuns: 20 },
      );
    });
  });
});
