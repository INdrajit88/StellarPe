/**
 * Unit tests for the CSRF protection middleware.
 *
 * Validates:
 * - GET/HEAD/OPTIONS requests pass through without CSRF check
 * - POST/PUT/DELETE/PATCH requests require the x-csrf-token header
 * - Missing or empty CSRF token returns 403
 * - Present CSRF token passes validation
 *
 * @see Requirements 13.7 (CSRF protection on state-mutating endpoints)
 */

import { validateCsrf, CSRF_HEADER } from '../csrf';

// ── Helpers ─────────────────────────────────────────────────────────────

function createMockRequest(
  method: string,
  headers: Record<string, string> = {},
): Request {
  return new Request('http://localhost/api/payments/send', {
    method,
    headers,
  });
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('CSRF Protection', () => {
  describe('non-mutating methods', () => {
    it('allows GET requests without CSRF token', () => {
      const req = createMockRequest('GET');
      expect(validateCsrf(req)).toBeNull();
    });

    it('allows HEAD requests without CSRF token', () => {
      const req = createMockRequest('HEAD');
      expect(validateCsrf(req)).toBeNull();
    });

    it('allows OPTIONS requests without CSRF token', () => {
      const req = createMockRequest('OPTIONS');
      expect(validateCsrf(req)).toBeNull();
    });
  });

  describe('state-mutating methods', () => {
    const mutatingMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];

    for (const method of mutatingMethods) {
      it(`returns 403 for ${method} without CSRF token`, async () => {
        const req = createMockRequest(method);
        const result = validateCsrf(req);

        expect(result).not.toBeNull();
        expect(result).toBeInstanceOf(Response);
        expect(result!.status).toBe(403);

        const body = await result!.json();
        expect(body.error).toContain('CSRF token missing');
      });

      it(`returns 403 for ${method} with empty CSRF token`, async () => {
        const req = createMockRequest(method, { [CSRF_HEADER]: '' });
        const result = validateCsrf(req);

        expect(result).not.toBeNull();
        expect(result!.status).toBe(403);
      });

      it(`returns 403 for ${method} with whitespace-only CSRF token`, async () => {
        const req = createMockRequest(method, { [CSRF_HEADER]: '   ' });
        const result = validateCsrf(req);

        expect(result).not.toBeNull();
        expect(result!.status).toBe(403);
      });

      it(`allows ${method} with a valid CSRF token`, () => {
        const req = createMockRequest(method, { [CSRF_HEADER]: 'valid-token-123' });
        expect(validateCsrf(req)).toBeNull();
      });
    }
  });

  describe('CSRF_HEADER constant', () => {
    it('exports the correct header name', () => {
      expect(CSRF_HEADER).toBe('x-csrf-token');
    });
  });
});
