/**
 * Unit tests for PUT /api/admin/users/[id]/status route handler.
 *
 * Tests cover:
 * - Successful account activation returns 200
 * - Successful account deactivation returns 200
 * - CSRF check rejects missing token with 403
 * - Role guard rejects USER role with 403
 * - Role guard rejects MERCHANT role with 403
 * - Role guard rejects missing role with 403
 * - Zod validation rejects invalid status values with 400
 * - Invalid JSON body returns 400
 * - AdminError USER_NOT_FOUND mapped to 404
 * - Unexpected errors return 500
 *
 * @see Requirements 12.4, 12.5, 12.6, 13.7
 */

import { PUT } from '../users/[id]/status/route';
import * as AdminServiceModule from '@/lib/services/admin.service';
import { AdminError, AdminErrorCode } from '@/lib/services/admin.service';

// Mock AdminService.setAccountStatus
jest.mock('@/lib/services/admin.service', () => {
  const actual = jest.requireActual('@/lib/services/admin.service') as typeof AdminServiceModule;
  return {
    ...actual,
    setAccountStatus: jest.fn(),
  };
});

const mockSetAccountStatus = AdminServiceModule.setAccountStatus as jest.MockedFunction<
  typeof AdminServiceModule.setAccountStatus
>;

/** Default target user ID used in tests. */
const TARGET_USER_ID = 'user-target-123';

/**
 * Helper: builds a PUT Request with JSON body and auth headers.
 */
function buildPutRequest(
  body: unknown,
  options?: {
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
    headers['x-user-id'] = 'admin-1';
    headers['x-user-role'] = options?.role ?? 'ADMIN';
  }

  return new Request(`http://localhost/api/admin/users/${TARGET_USER_ID}/status`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
}

/**
 * Helper: builds a PUT Request with invalid JSON body.
 */
function buildBadJsonRequest(): Request {
  return new Request(`http://localhost/api/admin/users/${TARGET_USER_ID}/status`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': 'test-csrf-token',
      'x-user-id': 'admin-1',
      'x-user-role': 'ADMIN',
    },
    body: 'not-valid-json{{{',
  });
}

/** Builds the params promise matching Next.js dynamic route convention. */
function buildParams(id: string = TARGET_USER_ID): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe('PUT /api/admin/users/[id]/status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 when activating an account', async () => {
    mockSetAccountStatus.mockResolvedValueOnce(undefined);

    const request = buildPutRequest({ status: 'ACTIVE' });
    const response = await PUT(request, buildParams());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toContain('ACTIVE');
    expect(mockSetAccountStatus).toHaveBeenCalledWith(TARGET_USER_ID, 'ACTIVE');
  });

  it('returns 200 when deactivating an account', async () => {
    mockSetAccountStatus.mockResolvedValueOnce(undefined);

    const request = buildPutRequest({ status: 'INACTIVE' });
    const response = await PUT(request, buildParams());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toContain('INACTIVE');
    expect(mockSetAccountStatus).toHaveBeenCalledWith(TARGET_USER_ID, 'INACTIVE');
  });

  it('uses the correct user ID from params', async () => {
    const customId = 'custom-user-id';
    mockSetAccountStatus.mockResolvedValueOnce(undefined);

    const request = buildPutRequest({ status: 'ACTIVE' });
    const response = await PUT(request, buildParams(customId));

    expect(response.status).toBe(200);
    expect(mockSetAccountStatus).toHaveBeenCalledWith(customId, 'ACTIVE');
  });

  it('returns 403 when CSRF token is missing', async () => {
    const request = buildPutRequest({ status: 'ACTIVE' }, { omitCsrf: true });
    const response = await PUT(request, buildParams());

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('CSRF');
    expect(mockSetAccountStatus).not.toHaveBeenCalled();
  });

  it('returns 403 for USER role', async () => {
    const request = buildPutRequest({ status: 'ACTIVE' }, { role: 'USER' });
    const response = await PUT(request, buildParams());

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('Forbidden');
    expect(mockSetAccountStatus).not.toHaveBeenCalled();
  });

  it('returns 403 for MERCHANT role', async () => {
    const request = buildPutRequest({ status: 'ACTIVE' }, { role: 'MERCHANT' });
    const response = await PUT(request, buildParams());

    expect(response.status).toBe(403);
    expect(mockSetAccountStatus).not.toHaveBeenCalled();
  });

  it('returns 403 when role is missing', async () => {
    const request = buildPutRequest({ status: 'ACTIVE' }, { omitAuth: true });
    const response = await PUT(request, buildParams());

    expect(response.status).toBe(403);
    expect(mockSetAccountStatus).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid status value', async () => {
    const request = buildPutRequest({ status: 'BANNED' });
    const response = await PUT(request, buildParams());

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Validation failed.');
    expect(mockSetAccountStatus).not.toHaveBeenCalled();
  });

  it('returns 400 for missing status field', async () => {
    const request = buildPutRequest({});
    const response = await PUT(request, buildParams());

    expect(response.status).toBe(400);
    expect(mockSetAccountStatus).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON body', async () => {
    const request = buildBadJsonRequest();
    const response = await PUT(request, buildParams());

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid JSON');
  });

  it('returns 404 when target user is not found', async () => {
    mockSetAccountStatus.mockRejectedValueOnce(
      new AdminError(
        'User with ID "nonexistent" not found.',
        AdminErrorCode.USER_NOT_FOUND,
        404,
      ),
    );

    const request = buildPutRequest({ status: 'INACTIVE' });
    const response = await PUT(request, buildParams('nonexistent'));

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.code).toBe(AdminErrorCode.USER_NOT_FOUND);
  });

  it('returns 500 for unexpected errors', async () => {
    mockSetAccountStatus.mockRejectedValueOnce(new Error('Database connection failed'));

    const request = buildPutRequest({ status: 'ACTIVE' });
    const response = await PUT(request, buildParams());

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('unexpected error');
  });
});
