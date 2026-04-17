/**
 * Unit tests for GET /api/admin/dashboard route handler.
 *
 * Tests cover:
 * - Successful dashboard stats return 200 with all metrics
 * - Role guard rejects USER role with 403
 * - Role guard rejects MERCHANT role with 403
 * - Role guard rejects missing role with 403
 * - Unexpected errors return 500
 *
 * @see Requirements 12.1, 12.6
 */

import { GET } from '../dashboard/route';
import * as AdminServiceModule from '@/lib/services/admin.service';

// Mock AdminService.getDashboardStats
jest.mock('@/lib/services/admin.service', () => {
  const actual = jest.requireActual('@/lib/services/admin.service') as typeof AdminServiceModule;
  return {
    ...actual,
    getDashboardStats: jest.fn(),
  };
});

const mockGetDashboardStats = AdminServiceModule.getDashboardStats as jest.MockedFunction<
  typeof AdminServiceModule.getDashboardStats
>;

/**
 * Helper: builds a GET Request with auth headers set by Edge middleware.
 */
function buildRequest(options?: {
  role?: string;
  omitAuth?: boolean;
}): Request {
  const headers: Record<string, string> = {};

  if (!options?.omitAuth) {
    headers['x-user-id'] = 'admin-1';
    headers['x-user-role'] = options?.role ?? 'ADMIN';
  }

  return new Request('http://localhost/api/admin/dashboard', {
    method: 'GET',
    headers,
  });
}

describe('GET /api/admin/dashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 with dashboard stats on success', async () => {
    const mockStats = {
      userCount: 42,
      merchantCount: 10,
      txCount: 500,
      volume: '12345.6789000',
      failedLast24h: 3,
    };
    mockGetDashboardStats.mockResolvedValueOnce(mockStats);

    const request = buildRequest();
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.userCount).toBe(42);
    expect(data.merchantCount).toBe(10);
    expect(data.txCount).toBe(500);
    expect(data.volume).toBe('12345.6789000');
    expect(data.failedLast24h).toBe(3);
    expect(mockGetDashboardStats).toHaveBeenCalledTimes(1);
  });

  it('returns 403 for USER role', async () => {
    const request = buildRequest({ role: 'USER' });
    const response = await GET(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('Forbidden');
    expect(mockGetDashboardStats).not.toHaveBeenCalled();
  });

  it('returns 403 for MERCHANT role', async () => {
    const request = buildRequest({ role: 'MERCHANT' });
    const response = await GET(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('Forbidden');
    expect(mockGetDashboardStats).not.toHaveBeenCalled();
  });

  it('returns 403 when role is missing', async () => {
    const request = buildRequest({ omitAuth: true });
    const response = await GET(request);

    expect(response.status).toBe(403);
    expect(mockGetDashboardStats).not.toHaveBeenCalled();
  });

  it('returns 500 for unexpected errors', async () => {
    mockGetDashboardStats.mockRejectedValueOnce(new Error('Database connection failed'));

    const request = buildRequest();
    const response = await GET(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('unexpected error');
  });
});
