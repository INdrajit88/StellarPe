/**
 * Unit tests for GET /api/admin/users route handler.
 *
 * Tests cover:
 * - Successful paginated user list returns 200
 * - Search query parameter filters results
 * - Page query parameter controls pagination
 * - Invalid page parameter returns 400
 * - Role guard rejects USER role with 403
 * - Role guard rejects MERCHANT role with 403
 * - Role guard rejects missing role with 403
 * - Unexpected errors return 500
 *
 * @see Requirements 12.2, 12.3, 12.6
 */

import { GET } from '../users/route';
import * as AdminServiceModule from '@/lib/services/admin.service';

// Mock AdminService.listUsers
jest.mock('@/lib/services/admin.service', () => {
  const actual = jest.requireActual('@/lib/services/admin.service') as typeof AdminServiceModule;
  return {
    ...actual,
    listUsers: jest.fn(),
  };
});

const mockListUsers = AdminServiceModule.listUsers as jest.MockedFunction<
  typeof AdminServiceModule.listUsers
>;

/**
 * Helper: builds a GET Request with auth headers and optional query params.
 */
function buildRequest(options?: {
  role?: string;
  omitAuth?: boolean;
  page?: string;
  search?: string;
}): Request {
  const headers: Record<string, string> = {};

  if (!options?.omitAuth) {
    headers['x-user-id'] = 'admin-1';
    headers['x-user-role'] = options?.role ?? 'ADMIN';
  }

  const url = new URL('http://localhost/api/admin/users');
  if (options?.page !== undefined) {
    url.searchParams.set('page', options.page);
  }
  if (options?.search !== undefined) {
    url.searchParams.set('search', options.search);
  }

  return new Request(url.toString(), {
    method: 'GET',
    headers,
  });
}

describe('GET /api/admin/users', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockResult = {
    users: [
      { id: 'u1', username: 'alice', email: 'alice@test.com', role: 'USER', status: 'ACTIVE', createdAt: new Date().toISOString() },
      { id: 'u2', username: 'bob', email: 'bob@test.com', role: 'MERCHANT', status: 'ACTIVE', createdAt: new Date().toISOString() },
    ],
    pagination: { page: 1, pageSize: 25, total: 2, totalPages: 1 },
  };

  it('returns 200 with paginated user list on success', async () => {
    mockListUsers.mockResolvedValueOnce(mockResult);

    const request = buildRequest();
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.users).toHaveLength(2);
    expect(data.pagination.page).toBe(1);
    expect(data.pagination.pageSize).toBe(25);
    expect(mockListUsers).toHaveBeenCalledWith(1, undefined);
  });

  it('passes search query parameter to service', async () => {
    mockListUsers.mockResolvedValueOnce(mockResult);

    const request = buildRequest({ search: 'alice' });
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockListUsers).toHaveBeenCalledWith(1, 'alice');
  });

  it('passes page query parameter to service', async () => {
    mockListUsers.mockResolvedValueOnce(mockResult);

    const request = buildRequest({ page: '3' });
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockListUsers).toHaveBeenCalledWith(3, undefined);
  });

  it('passes both page and search to service', async () => {
    mockListUsers.mockResolvedValueOnce(mockResult);

    const request = buildRequest({ page: '2', search: 'bob' });
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mockListUsers).toHaveBeenCalledWith(2, 'bob');
  });

  it('returns 400 for non-integer page parameter', async () => {
    const request = buildRequest({ page: 'abc' });
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('page');
    expect(mockListUsers).not.toHaveBeenCalled();
  });

  it('returns 400 for page parameter less than 1', async () => {
    const request = buildRequest({ page: '0' });
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('page');
    expect(mockListUsers).not.toHaveBeenCalled();
  });

  it('returns 400 for negative page parameter', async () => {
    const request = buildRequest({ page: '-1' });
    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(mockListUsers).not.toHaveBeenCalled();
  });

  it('returns 403 for USER role', async () => {
    const request = buildRequest({ role: 'USER' });
    const response = await GET(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('Forbidden');
    expect(mockListUsers).not.toHaveBeenCalled();
  });

  it('returns 403 for MERCHANT role', async () => {
    const request = buildRequest({ role: 'MERCHANT' });
    const response = await GET(request);

    expect(response.status).toBe(403);
    expect(mockListUsers).not.toHaveBeenCalled();
  });

  it('returns 403 when role is missing', async () => {
    const request = buildRequest({ omitAuth: true });
    const response = await GET(request);

    expect(response.status).toBe(403);
    expect(mockListUsers).not.toHaveBeenCalled();
  });

  it('returns 500 for unexpected errors', async () => {
    mockListUsers.mockRejectedValueOnce(new Error('Database connection failed'));

    const request = buildRequest();
    const response = await GET(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('unexpected error');
  });
});
