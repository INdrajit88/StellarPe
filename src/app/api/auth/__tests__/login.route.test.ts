/**
 * Unit tests for POST /api/auth/login route handler.
 *
 * Tests cover:
 * - Successful login returns 200 with token and user
 * - CSRF check rejects missing token with 403
 * - Rate limiter returns 429 when exceeded
 * - Invalid credentials mapped to 401
 * - Account locked mapped to 423
 * - Zod validation rejects invalid payloads with 400
 * - Invalid JSON body returns 400
 * - Unexpected errors return 500
 */

import { POST } from '../login/route';
import * as AuthServiceModule from '@/lib/services/auth.service';
import { AuthError, AuthErrorCode } from '@/lib/services/auth.service';
import { authRateLimiter } from '@/lib/middleware/rate-limiter';

// Mock AuthService.login
jest.mock('@/lib/services/auth.service', () => {
  const actual = jest.requireActual('@/lib/services/auth.service') as typeof AuthServiceModule;
  return {
    ...actual,
    login: jest.fn(),
  };
});

const mockLogin = AuthServiceModule.login as jest.MockedFunction<typeof AuthServiceModule.login>;

/**
 * Helper: builds a Request object with a JSON body and standard headers.
 */
function buildRequest(
  body: unknown,
  options?: { omitCsrf?: boolean; ip?: string },
): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };

  if (!options?.omitCsrf) {
    headers['x-csrf-token'] = 'test-csrf-token';
  }

  if (options?.ip) {
    headers['x-forwarded-for'] = options.ip;
  }

  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

/**
 * Helper: builds a Request with an invalid JSON body.
 */
function buildBadJsonRequest(): Request {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': 'test-csrf-token',
    },
    body: 'not-valid-json{{{',
  });
}

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authRateLimiter.clear();
  });

  const validPayload = {
    email: 'test@example.com',
    password: 'securepassword123',
  };

  it('returns 200 with token and user on successful login', async () => {
    mockLogin.mockResolvedValueOnce({
      token: 'jwt-token-xyz',
      user: { id: 'user-1', username: 'testuser', email: 'test@example.com', role: 'USER' },
    });

    const request = buildRequest(validPayload);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.token).toBe('jwt-token-xyz');
    expect(data.user).toEqual({
      id: 'user-1',
      username: 'testuser',
      email: 'test@example.com',
      role: 'USER',
    });
    expect(mockLogin).toHaveBeenCalledWith(validPayload);
  });

  it('returns 403 when CSRF token is missing', async () => {
    const request = buildRequest(validPayload, { omitCsrf: true });
    const response = await POST(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('CSRF');
  });

  it('returns 400 for invalid JSON body', async () => {
    const request = buildBadJsonRequest();
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid JSON');
  });

  it('returns 400 when email is missing', async () => {
    const request = buildRequest({ password: 'test123456' });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Validation failed.');
    expect(data.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'email' }),
      ]),
    );
  });

  it('returns 400 when password is missing', async () => {
    const request = buildRequest({ email: 'test@example.com' });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'password' }),
      ]),
    );
  });

  it('returns 400 for invalid email format', async () => {
    const request = buildRequest({ email: 'not-an-email', password: 'test123456' });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'email' }),
      ]),
    );
  });

  it('returns 401 for invalid credentials', async () => {
    mockLogin.mockRejectedValueOnce(
      new AuthError('Invalid credentials.', AuthErrorCode.INVALID_CREDENTIALS, 401),
    );

    const request = buildRequest(validPayload);
    const response = await POST(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.error).toBe('Invalid credentials.');
    expect(data.code).toBe(AuthErrorCode.INVALID_CREDENTIALS);
  });

  it('returns 423 when account is locked', async () => {
    mockLogin.mockRejectedValueOnce(
      new AuthError(
        'Account is temporarily locked due to too many failed login attempts.',
        AuthErrorCode.ACCOUNT_LOCKED,
        423,
      ),
    );

    const request = buildRequest(validPayload);
    const response = await POST(request);

    expect(response.status).toBe(423);
    const data = await response.json();
    expect(data.error).toContain('locked');
    expect(data.code).toBe(AuthErrorCode.ACCOUNT_LOCKED);
  });

  it('returns 401 when account is inactive', async () => {
    mockLogin.mockRejectedValueOnce(
      new AuthError('Invalid credentials.', AuthErrorCode.ACCOUNT_INACTIVE, 401),
    );

    const request = buildRequest(validPayload);
    const response = await POST(request);

    expect(response.status).toBe(401);
    const data = await response.json();
    // Generic message — does not reveal inactive status.
    expect(data.error).toBe('Invalid credentials.');
  });

  it('returns 429 when rate limit is exceeded', async () => {
    const testIp = '192.168.2.200';
    // Exhaust the rate limit (10 requests per minute for auth).
    for (let i = 0; i < 10; i++) {
      authRateLimiter.check(testIp);
    }

    const request = buildRequest(validPayload, { ip: testIp });
    const response = await POST(request);

    expect(response.status).toBe(429);
    const data = await response.json();
    expect(data.error).toContain('Too many requests');
    // login should not have been called.
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('includes rate limit headers in 429 response', async () => {
    const testIp = '192.168.3.300';
    for (let i = 0; i < 10; i++) {
      authRateLimiter.check(testIp);
    }

    const request = buildRequest(validPayload, { ip: testIp });
    const response = await POST(request);

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBeTruthy();
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
  });

  it('returns 500 for unexpected errors', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Database connection failed'));

    const request = buildRequest(validPayload);
    const response = await POST(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('unexpected error');
  });
});
