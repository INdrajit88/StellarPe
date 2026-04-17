/**
 * Unit tests for POST /api/auth/register route handler.
 *
 * Tests cover:
 * - Successful registration returns 201 with user and token
 * - Zod validation rejects invalid payloads with 400
 * - CSRF check rejects missing token with 403
 * - Rate limiter returns 429 when exceeded
 * - Duplicate username/email mapped to 409
 * - Invalid JSON body returns 400
 * - Unexpected errors return 500
 */

import { POST } from '../register/route';
import * as AuthServiceModule from '@/lib/services/auth.service';
import { AuthError, AuthErrorCode } from '@/lib/services/auth.service';
import { authRateLimiter } from '@/lib/middleware/rate-limiter';

// Mock AuthService.register
jest.mock('@/lib/services/auth.service', () => {
  const actual = jest.requireActual('@/lib/services/auth.service') as typeof AuthServiceModule;
  return {
    ...actual,
    register: jest.fn(),
  };
});

const mockRegister = AuthServiceModule.register as jest.MockedFunction<typeof AuthServiceModule.register>;

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

  return new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

/**
 * Helper: builds a Request with an invalid JSON body.
 */
function buildBadJsonRequest(): Request {
  return new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': 'test-csrf-token',
    },
    body: 'not-valid-json{{{',
  });
}

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authRateLimiter.clear();
  });

  const validPayload = {
    username: 'testuser',
    email: 'test@example.com',
    password: 'securepassword123',
    role: 'USER',
  };

  it('returns 201 with user and token on successful registration', async () => {
    mockRegister.mockResolvedValueOnce({
      user: { id: 'user-1', username: 'testuser', email: 'test@example.com', role: 'USER' },
      token: 'jwt-token-abc',
    });

    const request = buildRequest(validPayload);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.user).toEqual({
      id: 'user-1',
      username: 'testuser',
      email: 'test@example.com',
      role: 'USER',
    });
    expect(data.token).toBe('jwt-token-abc');
    expect(mockRegister).toHaveBeenCalledWith(validPayload);
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

  it('returns 400 when required fields are missing', async () => {
    const request = buildRequest({ email: 'test@example.com' });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Validation failed.');
    expect(data.details).toBeDefined();
    expect(Array.isArray(data.details)).toBe(true);
  });

  it('returns 400 when username is too short', async () => {
    const request = buildRequest({ ...validPayload, username: 'ab' });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'username' }),
      ]),
    );
  });

  it('returns 400 for invalid email format', async () => {
    const request = buildRequest({ ...validPayload, email: 'not-an-email' });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'email' }),
      ]),
    );
  });

  it('returns 400 for invalid role', async () => {
    const request = buildRequest({ ...validPayload, role: 'ADMIN' });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('returns 409 when username is duplicate', async () => {
    mockRegister.mockRejectedValueOnce(
      new AuthError('Username is already taken.', AuthErrorCode.DUPLICATE_USERNAME, 409),
    );

    const request = buildRequest(validPayload);
    const response = await POST(request);

    expect(response.status).toBe(409);
    const data = await response.json();
    expect(data.error).toContain('Username');
    expect(data.code).toBe(AuthErrorCode.DUPLICATE_USERNAME);
  });

  it('returns 409 when email is duplicate', async () => {
    mockRegister.mockRejectedValueOnce(
      new AuthError('Email is already registered.', AuthErrorCode.DUPLICATE_EMAIL, 409),
    );

    const request = buildRequest(validPayload);
    const response = await POST(request);

    expect(response.status).toBe(409);
    const data = await response.json();
    expect(data.error).toContain('Email');
    expect(data.code).toBe(AuthErrorCode.DUPLICATE_EMAIL);
  });

  it('returns 429 when rate limit is exceeded', async () => {
    // Exhaust the rate limit (10 requests per minute for auth).
    const testIp = '192.168.1.100';
    for (let i = 0; i < 10; i++) {
      authRateLimiter.check(testIp);
    }

    const request = buildRequest(validPayload, { ip: testIp });
    const response = await POST(request);

    expect(response.status).toBe(429);
    const data = await response.json();
    expect(data.error).toContain('Too many requests');
    // register should not have been called.
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('uses x-real-ip when x-forwarded-for is absent for rate limiting', async () => {
    const request = new Request('http://localhost/api/auth/register', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': 'test-csrf-token',
        'x-real-ip': '10.0.0.1',
      },
      body: JSON.stringify(validPayload),
    });

    mockRegister.mockResolvedValueOnce({
      user: { id: 'user-1', username: 'testuser', email: 'test@example.com', role: 'USER' },
      token: 'jwt-token-abc',
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
  });

  it('returns 500 for unexpected errors', async () => {
    mockRegister.mockRejectedValueOnce(new Error('Database connection failed'));

    const request = buildRequest(validPayload);
    const response = await POST(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('unexpected error');
  });
});
