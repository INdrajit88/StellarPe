/**
 * Unit tests for POST /api/users/pin and PUT /api/users/pin route handlers.
 *
 * Tests cover:
 * POST (set PIN):
 * - Successful PIN set returns 200
 * - CSRF check rejects missing token with 403
 * - Role guard rejects MERCHANT role with 403
 * - Role guard rejects ADMIN role with 403
 * - Zod validation rejects invalid PIN with 400
 * - Invalid JSON body returns 400
 * - PIN format error from service returns 400
 * - Unexpected errors return 500
 *
 * PUT (reset PIN):
 * - Successful PIN reset returns 200
 * - CSRF check rejects missing token with 403
 * - Role guard rejects MERCHANT role with 403
 * - Zod validation rejects invalid PIN with 400
 * - Invalid JSON body returns 400
 * - PIN format error from service returns 400
 * - Unexpected errors return 500
 */

import { POST, PUT } from '../pin/route';
import * as PINServiceModule from '@/lib/services/pin.service';

// Mock PINService methods
jest.mock('@/lib/services/pin.service', () => {
  const actual = jest.requireActual('@/lib/services/pin.service') as typeof PINServiceModule;
  return {
    ...actual,
    setPin: jest.fn(),
    resetPin: jest.fn(),
  };
});

const mockSetPin = PINServiceModule.setPin as jest.MockedFunction<
  typeof PINServiceModule.setPin
>;
const mockResetPin = PINServiceModule.resetPin as jest.MockedFunction<
  typeof PINServiceModule.resetPin
>;

/**
 * Helper: builds a POST Request with JSON body and auth headers.
 */
function buildPostRequest(
  body: unknown,
  options?: {
    userId?: string;
    role?: string;
    omitCsrf?: boolean;
    omitAuth?: boolean;
  },
): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };

  if (!options?.omitCsrf) {
    headers['x-csrf-token'] = 'test-csrf-token';
  }

  if (!options?.omitAuth) {
    headers['x-user-id'] = options?.userId ?? 'user-1';
    headers['x-user-role'] = options?.role ?? 'USER';
  }

  return new Request('http://localhost/api/users/pin', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

/**
 * Helper: builds a PUT Request with JSON body and auth headers.
 */
function buildPutRequest(
  body: unknown,
  options?: {
    userId?: string;
    role?: string;
    omitCsrf?: boolean;
    omitAuth?: boolean;
  },
): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };

  if (!options?.omitCsrf) {
    headers['x-csrf-token'] = 'test-csrf-token';
  }

  if (!options?.omitAuth) {
    headers['x-user-id'] = options?.userId ?? 'user-1';
    headers['x-user-role'] = options?.role ?? 'USER';
  }

  return new Request('http://localhost/api/users/pin', {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
}

/**
 * Helper: builds a POST Request with invalid JSON body.
 */
function buildBadJsonPostRequest(): Request {
  return new Request('http://localhost/api/users/pin', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': 'test-csrf-token',
      'x-user-id': 'user-1',
      'x-user-role': 'USER',
    },
    body: 'not-valid-json{{{',
  });
}

/**
 * Helper: builds a PUT Request with invalid JSON body.
 */
function buildBadJsonPutRequest(): Request {
  return new Request('http://localhost/api/users/pin', {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': 'test-csrf-token',
      'x-user-id': 'user-1',
      'x-user-role': 'USER',
    },
    body: 'not-valid-json{{{',
  });
}

describe('POST /api/users/pin (set PIN)', () => {
  it('returns 200 on successful PIN set', async () => {
    mockSetPin.mockResolvedValueOnce(undefined);

    const request = buildPostRequest({ pin: '1234' });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toContain('PIN set successfully');
    expect(mockSetPin).toHaveBeenCalledWith('user-1', '1234');
  });

  it('returns 200 for 6-digit PIN', async () => {
    mockSetPin.mockResolvedValueOnce(undefined);

    const request = buildPostRequest({ pin: '123456' });
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockSetPin).toHaveBeenCalledWith('user-1', '123456');
  });

  it('returns 403 when CSRF token is missing', async () => {
    const request = buildPostRequest({ pin: '1234' }, { omitCsrf: true });
    const response = await POST(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('CSRF');
    expect(mockSetPin).not.toHaveBeenCalled();
  });

  it('returns 403 for MERCHANT role', async () => {
    const request = buildPostRequest({ pin: '1234' }, { role: 'MERCHANT' });
    const response = await POST(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('Forbidden');
    expect(mockSetPin).not.toHaveBeenCalled();
  });

  it('returns 403 for ADMIN role', async () => {
    const request = buildPostRequest({ pin: '1234' }, { role: 'ADMIN' });
    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(mockSetPin).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON body', async () => {
    const request = buildBadJsonPostRequest();
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid JSON');
  });

  it('returns 400 when pin is missing', async () => {
    const request = buildPostRequest({});
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Validation failed.');
  });

  it('returns 400 when pin has letters', async () => {
    const request = buildPostRequest({ pin: '12ab' });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('returns 400 when pin is too short', async () => {
    const request = buildPostRequest({ pin: '123' });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('returns 400 when pin is too long', async () => {
    const request = buildPostRequest({ pin: '1234567' });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('returns 400 when service throws PIN format error', async () => {
    mockSetPin.mockRejectedValueOnce(new Error('PIN must be 4 to 6 numeric digits.'));

    const request = buildPostRequest({ pin: '1234' });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('PIN must be');
  });

  it('returns 500 for unexpected errors', async () => {
    mockSetPin.mockRejectedValueOnce(new Error('Database connection failed'));

    const request = buildPostRequest({ pin: '1234' });
    const response = await POST(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('unexpected error');
  });
});

describe('PUT /api/users/pin (reset PIN)', () => {
  it('returns 200 on successful PIN reset', async () => {
    mockResetPin.mockResolvedValueOnce(undefined);

    const request = buildPutRequest({ newPin: '5678' });
    const response = await PUT(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toContain('PIN reset successfully');
    expect(mockResetPin).toHaveBeenCalledWith('user-1', '5678');
  });

  it('returns 200 for 5-digit PIN', async () => {
    mockResetPin.mockResolvedValueOnce(undefined);

    const request = buildPutRequest({ newPin: '12345' });
    const response = await PUT(request);

    expect(response.status).toBe(200);
    expect(mockResetPin).toHaveBeenCalledWith('user-1', '12345');
  });

  it('returns 403 when CSRF token is missing', async () => {
    const request = buildPutRequest({ newPin: '5678' }, { omitCsrf: true });
    const response = await PUT(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('CSRF');
    expect(mockResetPin).not.toHaveBeenCalled();
  });

  it('returns 403 for MERCHANT role', async () => {
    const request = buildPutRequest({ newPin: '5678' }, { role: 'MERCHANT' });
    const response = await PUT(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('Forbidden');
    expect(mockResetPin).not.toHaveBeenCalled();
  });

  it('returns 403 for ADMIN role', async () => {
    const request = buildPutRequest({ newPin: '5678' }, { role: 'ADMIN' });
    const response = await PUT(request);

    expect(response.status).toBe(403);
    expect(mockResetPin).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON body', async () => {
    const request = buildBadJsonPutRequest();
    const response = await PUT(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid JSON');
  });

  it('returns 400 when newPin is missing', async () => {
    const request = buildPutRequest({});
    const response = await PUT(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Validation failed.');
  });

  it('returns 400 when newPin has letters', async () => {
    const request = buildPutRequest({ newPin: 'abcd' });
    const response = await PUT(request);

    expect(response.status).toBe(400);
  });

  it('returns 400 when service throws PIN format error', async () => {
    mockResetPin.mockRejectedValueOnce(new Error('PIN must be 4 to 6 numeric digits.'));

    const request = buildPutRequest({ newPin: '5678' });
    const response = await PUT(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('PIN must be');
  });

  it('returns 500 for unexpected errors', async () => {
    mockResetPin.mockRejectedValueOnce(new Error('Database connection failed'));

    const request = buildPutRequest({ newPin: '5678' });
    const response = await PUT(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('unexpected error');
  });
});
