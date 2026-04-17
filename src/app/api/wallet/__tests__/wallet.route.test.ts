/**
 * Unit tests for GET /api/wallet route handler.
 *
 * Tests cover:
 * - Successful wallet details return 200 with address and balance
 * - Role guard rejects ADMIN role with 403
 * - Role guard rejects missing role with 403
 * - Rate limiter returns 429 when exceeded
 * - No wallet found returns 404
 * - Unexpected errors return 500
 */

import { GET } from '../route';
import * as WalletServiceModule from '@/lib/services/wallet.service';
import { paymentRateLimiter } from '@/lib/middleware/rate-limiter';

// Mock WalletService.getWalletDetails
jest.mock('@/lib/services/wallet.service', () => {
  const actual = jest.requireActual('@/lib/services/wallet.service') as typeof WalletServiceModule;
  return {
    ...actual,
    getWalletDetails: jest.fn(),
  };
});

const mockGetWalletDetails = WalletServiceModule.getWalletDetails as jest.MockedFunction<
  typeof WalletServiceModule.getWalletDetails
>;

/**
 * Helper: builds a GET Request with auth headers set by Edge middleware.
 */
function buildRequest(options?: {
  userId?: string;
  role?: string;
  omitAuth?: boolean;
}): Request {
  const headers: Record<string, string> = {};

  if (!options?.omitAuth) {
    headers['x-user-id'] = options?.userId ?? 'user-1';
    headers['x-user-role'] = options?.role ?? 'USER';
  }

  return new Request('http://localhost/api/wallet', {
    method: 'GET',
    headers,
  });
}

describe('GET /api/wallet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    paymentRateLimiter.clear();
  });

  it('returns 200 with wallet details on success', async () => {
    mockGetWalletDetails.mockResolvedValueOnce({
      stellarAddress: `G${'A'.repeat(55)}`,
      balance: '10000.0000000',
    });

    const request = buildRequest();
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.stellarAddress).toBe(`G${'A'.repeat(55)}`);
    expect(data.balance).toBe('10000.0000000');
    expect(mockGetWalletDetails).toHaveBeenCalledWith('user-1');
  });

  it('returns 200 for MERCHANT role', async () => {
    mockGetWalletDetails.mockResolvedValueOnce({
      stellarAddress: `G${'B'.repeat(55)}`,
      balance: '5000.0000000',
    });

    const request = buildRequest({ role: 'MERCHANT' });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('returns 403 for ADMIN role', async () => {
    const request = buildRequest({ role: 'ADMIN' });
    const response = await GET(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('Forbidden');
  });

  it('returns 403 when role is missing', async () => {
    const request = buildRequest({ omitAuth: true });
    const response = await GET(request);

    expect(response.status).toBe(403);
  });

  it('returns 429 when rate limit is exceeded', async () => {
    const testUserId = 'rate-limit-user';
    // Exhaust the rate limit (20 requests per minute for payment endpoints).
    for (let i = 0; i < 20; i++) {
      paymentRateLimiter.check(testUserId);
    }

    const request = buildRequest({ userId: testUserId });
    const response = await GET(request);

    expect(response.status).toBe(429);
    const data = await response.json();
    expect(data.error).toContain('Too many requests');
    expect(mockGetWalletDetails).not.toHaveBeenCalled();
  });

  it('includes rate limit headers in 429 response', async () => {
    const testUserId = 'rate-limit-headers-user';
    for (let i = 0; i < 20; i++) {
      paymentRateLimiter.check(testUserId);
    }

    const request = buildRequest({ userId: testUserId });
    const response = await GET(request);

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBeTruthy();
    expect(response.headers.get('X-RateLimit-Remaining')).toBe('0');
  });

  it('returns 404 when no wallet is found', async () => {
    mockGetWalletDetails.mockRejectedValueOnce(
      new Error('No wallet found for user user-1'),
    );

    const request = buildRequest();
    const response = await GET(request);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain('No wallet found');
  });

  it('returns 500 for unexpected errors', async () => {
    mockGetWalletDetails.mockRejectedValueOnce(new Error('Horizon API timeout'));

    const request = buildRequest();
    const response = await GET(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('unexpected error');
  });
});
