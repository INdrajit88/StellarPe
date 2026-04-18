/**
 * Unit tests for the Next.js Edge middleware (src/middleware.ts).
 *
 * Tests JWT extraction, decoding, header forwarding, and rejection
 * of missing/invalid/expired tokens.
 *
 * Since the middleware uses NextRequest/NextResponse from next/server,
 * we mock those to test in a Node.js environment.
 *
 * @see Requirements 1.6 (expired/absent JWT rejected with 401)
 */

import { jest } from '@jest/globals';

// ── Mock NextRequest / NextResponse ────────────────────────────────────

// We need to mock next/server since it's Edge-only.
// Build a minimal mock that mirrors the API used in middleware.ts.

let capturedRequestHeaders: Headers | null = null;

jest.mock('next/server', () => {
  class MockNextRequest {
    public nextUrl: { pathname: string };
    public headers: Headers;

    constructor(url: string, init?: { headers?: Record<string, string> }) {
      const parsed = new URL(url, 'http://localhost');
      this.nextUrl = { pathname: parsed.pathname };
      this.headers = new Headers(init?.headers || {});
    }
  }

  const MockNextResponse = {
    json(body: unknown, init?: { status?: number }) {
      return {
        _type: 'json',
        _body: body,
        status: init?.status || 200,
      };
    },
    next(opts?: { request?: { headers?: Headers } }) {
      capturedRequestHeaders = opts?.request?.headers || null;
      return {
        _type: 'next',
        status: 200,
      };
    },
  };

  return {
    __esModule: true,
    NextRequest: MockNextRequest,
    NextResponse: MockNextResponse,
  };
});

// Import the proxy (formerly middleware) after mocking.
import { proxy as middleware } from '@/proxy';
import { NextRequest } from 'next/server';

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Creates a base64url-encoded JWT with the given payload.
 * Does NOT sign it cryptographically — the middleware only decodes.
 */
function createTestJwt(payload: Record<string, unknown>): string {
  const header = { alg: 'HS256', typ: 'JWT' };

  function toBase64Url(obj: unknown): string {
    const json = JSON.stringify(obj);
    const base64 = Buffer.from(json).toString('base64');
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  const headerPart = toBase64Url(header);
  const payloadPart = toBase64Url(payload);
  const signature = 'fake-signature';

  return `${headerPart}.${payloadPart}.${signature}`;
}

function createRequest(
  path: string,
  headers: Record<string, string> = {},
): NextRequest {
  return new (NextRequest as unknown as new (url: string, init?: { headers?: Record<string, string> }) => NextRequest)(
    `http://localhost${path}`,
    { headers },
  );
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('Next.js Edge Middleware', () => {
  beforeEach(() => {
    capturedRequestHeaders = null;
  });

  describe('route matching', () => {
    it('passes through non-API routes', () => {
      const req = createRequest('/dashboard');
      const res = middleware(req) as unknown as { _type: string };
      expect(res._type).toBe('next');
    });

    it('passes through /api/auth/* routes without requiring a token', () => {
      const req = createRequest('/api/auth/login');
      const res = middleware(req) as unknown as { _type: string };
      expect(res._type).toBe('next');
    });

    it('passes through /api/auth/register route', () => {
      const req = createRequest('/api/auth/register');
      const res = middleware(req) as unknown as { _type: string };
      expect(res._type).toBe('next');
    });
  });

  describe('token extraction', () => {
    it('returns 401 when Authorization header is missing', () => {
      const req = createRequest('/api/wallet');
      const res = middleware(req) as unknown as { _type: string; _body: { error: string }; status: number };

      expect(res._type).toBe('json');
      expect(res.status).toBe(401);
      expect(res._body.error).toContain('Authentication required');
    });

    it('returns 401 when Authorization header does not start with Bearer', () => {
      const req = createRequest('/api/wallet', {
        authorization: 'Basic abc123',
      });
      const res = middleware(req) as unknown as { _type: string; status: number };

      expect(res._type).toBe('json');
      expect(res.status).toBe(401);
    });

    it('returns 401 when Bearer token is empty', () => {
      const req = createRequest('/api/wallet', {
        authorization: 'Bearer ',
      });
      const res = middleware(req) as unknown as { _type: string; status: number };

      expect(res._type).toBe('json');
      expect(res.status).toBe(401);
    });
  });

  describe('JWT decoding', () => {
    it('returns 401 for a malformed JWT (not 3 parts)', () => {
      const req = createRequest('/api/wallet', {
        authorization: 'Bearer not-a-jwt',
      });
      const res = middleware(req) as unknown as { _type: string; _body: { error: string }; status: number };

      expect(res._type).toBe('json');
      expect(res.status).toBe(401);
      expect(res._body.error).toBe('Invalid token.');
    });

    it('returns 401 when JWT payload is missing userId', () => {
      const token = createTestJwt({ role: 'USER', exp: Math.floor(Date.now() / 1000) + 3600 });
      const req = createRequest('/api/wallet', {
        authorization: `Bearer ${token}`,
      });
      const res = middleware(req) as unknown as { _type: string; status: number };

      expect(res._type).toBe('json');
      expect(res.status).toBe(401);
    });

    it('returns 401 when JWT payload is missing role', () => {
      const token = createTestJwt({ userId: 'user_1', exp: Math.floor(Date.now() / 1000) + 3600 });
      const req = createRequest('/api/wallet', {
        authorization: `Bearer ${token}`,
      });
      const res = middleware(req) as unknown as { _type: string; status: number };

      expect(res._type).toBe('json');
      expect(res.status).toBe(401);
    });

    it('returns 401 for an expired JWT', () => {
      const token = createTestJwt({
        userId: 'user_1',
        role: 'USER',
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago.
      });
      const req = createRequest('/api/wallet', {
        authorization: `Bearer ${token}`,
      });
      const res = middleware(req) as unknown as { _type: string; _body: { error: string }; status: number };

      expect(res._type).toBe('json');
      expect(res.status).toBe(401);
      expect(res._body.error).toBe('Token has expired.');
    });
  });

  describe('successful authentication', () => {
    it('forwards x-user-id and x-user-role headers for a valid token', () => {
      const token = createTestJwt({
        userId: 'user_123',
        role: 'USER',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      const req = createRequest('/api/wallet', {
        authorization: `Bearer ${token}`,
      });
      const res = middleware(req) as unknown as { _type: string; status: number };

      expect(res._type).toBe('next');
      expect(res.status).toBe(200);
      expect(capturedRequestHeaders?.get('x-user-id')).toBe('user_123');
      expect(capturedRequestHeaders?.get('x-user-role')).toBe('USER');
    });

    it('forwards the original authorization header along with new headers', () => {
      const token = createTestJwt({
        userId: 'user_456',
        role: 'MERCHANT',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      const req = createRequest('/api/payments/send', {
        authorization: `Bearer ${token}`,
      });
      middleware(req);

      expect(capturedRequestHeaders?.get('authorization')).toBe(`Bearer ${token}`);
      expect(capturedRequestHeaders?.get('x-user-id')).toBe('user_456');
      expect(capturedRequestHeaders?.get('x-user-role')).toBe('MERCHANT');
    });

    it('handles ADMIN role correctly', () => {
      const token = createTestJwt({
        userId: 'admin_1',
        role: 'ADMIN',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      const req = createRequest('/api/admin/dashboard', {
        authorization: `Bearer ${token}`,
      });
      middleware(req);

      expect(capturedRequestHeaders?.get('x-user-id')).toBe('admin_1');
      expect(capturedRequestHeaders?.get('x-user-role')).toBe('ADMIN');
    });
  });
});
