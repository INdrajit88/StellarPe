/**
 * Unit tests for GET /api/users/search route handler.
 *
 * Tests cover:
 * - Successful search returns 200 with matching users
 * - Empty results return 200 with empty array
 * - Missing 'q' parameter returns 400
 * - Empty 'q' parameter returns 400
 * - Role guard rejects MERCHANT role with 403
 * - Role guard rejects ADMIN role with 403
 * - Role guard rejects missing role with 403
 * - Unexpected errors return 500
 */

import { GET } from '../search/route';
import * as AuthServiceModule from '@/lib/services/auth.service';

// Mock AuthService.searchUsersByUsername
jest.mock('@/lib/services/auth.service', () => {
  const actual = jest.requireActual('@/lib/services/auth.service') as typeof AuthServiceModule;
  return {
    ...actual,
    searchUsersByUsername: jest.fn(),
  };
});

const mockSearchUsersByUsername = AuthServiceModule.searchUsersByUsername as jest.MockedFunction<
  typeof AuthServiceModule.searchUsersByUsername
>;

const VALID_ADDRESS = `G${'A'.repeat(55)}`;

/**
 * Helper: builds a GET Request with auth headers and query params.
 */
function buildRequest(options?: {
  query?: string | null;
  userId?: string;
  role?: string;
  omitAuth?: boolean;
}): Request {
  const headers: Record<string, string> = {};

  if (!options?.omitAuth) {
    headers['x-user-id'] = options?.userId ?? 'user-1';
    headers['x-user-role'] = options?.role ?? 'USER';
  }

  let url = 'http://localhost/api/users/search';
  if (options?.query !== undefined && options.query !== null) {
    url += `?q=${encodeURIComponent(options.query)}`;
  }

  return new Request(url, {
    method: 'GET',
    headers,
  });
}

describe('GET /api/users/search', () => {
  it('returns 200 with matching users', async () => {
    const mockResults = [
      { username: 'alice', stellarAddress: VALID_ADDRESS },
      { username: 'alice_bob', stellarAddress: `G${'B'.repeat(55)}` },
    ];
    mockSearchUsersByUsername.mockResolvedValueOnce(mockResults);

    const request = buildRequest({ query: 'ali' });
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.users).toEqual(mockResults);
    expect(mockSearchUsersByUsername).toHaveBeenCalledWith('ali');
  });

  it('returns 200 with empty array when no matches', async () => {
    mockSearchUsersByUsername.mockResolvedValueOnce([]);

    const request = buildRequest({ query: 'zzz' });
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.users).toEqual([]);
  });

  it('returns 400 when q parameter is missing', async () => {
    const request = buildRequest({});
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('"q"');
    expect(mockSearchUsersByUsername).not.toHaveBeenCalled();
  });

  it('returns 400 when q parameter is empty', async () => {
    const request = buildRequest({ query: '' });
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('"q"');
    expect(mockSearchUsersByUsername).not.toHaveBeenCalled();
  });

  it('returns 400 when q parameter is whitespace only', async () => {
    const request = buildRequest({ query: '   ' });
    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(mockSearchUsersByUsername).not.toHaveBeenCalled();
  });

  it('returns 403 for MERCHANT role', async () => {
    const request = buildRequest({ query: 'ali', role: 'MERCHANT' });
    const response = await GET(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('Forbidden');
    expect(mockSearchUsersByUsername).not.toHaveBeenCalled();
  });

  it('returns 403 for ADMIN role', async () => {
    const request = buildRequest({ query: 'ali', role: 'ADMIN' });
    const response = await GET(request);

    expect(response.status).toBe(403);
    expect(mockSearchUsersByUsername).not.toHaveBeenCalled();
  });

  it('returns 403 when role is missing', async () => {
    const request = buildRequest({ query: 'ali', omitAuth: true });
    const response = await GET(request);

    expect(response.status).toBe(403);
  });

  it('returns 500 for unexpected errors', async () => {
    mockSearchUsersByUsername.mockRejectedValueOnce(new Error('Database connection failed'));

    const request = buildRequest({ query: 'ali' });
    const response = await GET(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('unexpected error');
  });
});
