/**
 * Unit tests for GET /api/payments/history route handler.
 *
 * Tests cover:
 * - Successful history returns 200 with transactions and pagination
 * - Query parameters are parsed and passed to service correctly
 * - Role guard rejects ADMIN role with 403
 * - Rate limiter returns 429 when exceeded
 * - Invalid filter parameters return 400
 * - Unexpected errors return 500
 */

import { GET } from '../history/route';
import * as PaymentServiceModule from '@/lib/services/payment.service';
import { paymentRateLimiter } from '@/lib/middleware/rate-limiter';

// Mock PaymentService.getTransactionHistory
jest.mock('@/lib/services/payment.service', () => {
  const actual = jest.requireActual('@/lib/services/payment.service') as typeof PaymentServiceModule;
  return {
    ...actual,
    getTransactionHistory: jest.fn(),
  };
});

const mockGetTransactionHistory = PaymentServiceModule.getTransactionHistory as jest.MockedFunction<
  typeof PaymentServiceModule.getTransactionHistory
>;

/**
 * Helper: builds a GET Request with optional query parameters and auth headers.
 */
function buildRequest(
  queryParams?: Record<string, string>,
  options?: {
    userId?: string;
    role?: string;
    omitAuth?: boolean;
  },
): Request {
  const headers: Record<string, string> = {};

  if (!options?.omitAuth) {
    headers['x-user-id'] = options?.userId ?? 'user-1';
    headers['x-user-role'] = options?.role ?? 'USER';
  }

  let url = 'http://localhost/api/payments/history';
  if (queryParams) {
    const params = new URLSearchParams(queryParams);
    url += `?${params.toString()}`;
  }

  return new Request(url, {
    method: 'GET',
    headers,
  });
}

describe('GET /api/payments/history', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    paymentRateLimiter.clear();
  });

  const mockHistoryResult = {
    transactions: [
      {
        id: 'tx-1',
        stellarTxId: 'stellar-abc',
        senderAddress: `G${'A'.repeat(55)}`,
        recipientAddress: `G${'B'.repeat(55)}`,
        amount: '10.5',
        memo: 'Test',
        status: 'COMPLETED',
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ] as Record<string, unknown>[],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  };

  it('returns 200 with transactions and pagination', async () => {
    mockGetTransactionHistory.mockResolvedValueOnce(mockHistoryResult);

    const request = buildRequest();
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.transactions).toEqual(mockHistoryResult.transactions);
    expect(data.pagination).toEqual(mockHistoryResult.pagination);
    expect(mockGetTransactionHistory).toHaveBeenCalledWith('user-1', {});
  });

  it('returns 200 for MERCHANT role', async () => {
    mockGetTransactionHistory.mockResolvedValueOnce(mockHistoryResult);

    const request = buildRequest(undefined, { role: 'MERCHANT' });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it('passes page parameter to service', async () => {
    mockGetTransactionHistory.mockResolvedValueOnce(mockHistoryResult);

    const request = buildRequest({ page: '3' });
    await GET(request);

    expect(mockGetTransactionHistory).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ page: 3 }),
    );
  });

  it('passes direction filter to service', async () => {
    mockGetTransactionHistory.mockResolvedValueOnce(mockHistoryResult);

    const request = buildRequest({ direction: 'sent' });
    await GET(request);

    expect(mockGetTransactionHistory).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ direction: 'sent' }),
    );
  });

  it('passes status filter to service in uppercase', async () => {
    mockGetTransactionHistory.mockResolvedValueOnce(mockHistoryResult);

    const request = buildRequest({ status: 'completed' });
    await GET(request);

    expect(mockGetTransactionHistory).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ status: 'COMPLETED' }),
    );
  });

  it('passes date range filters to service', async () => {
    mockGetTransactionHistory.mockResolvedValueOnce(mockHistoryResult);

    const request = buildRequest({
      startDate: '2024-01-01T00:00:00.000Z',
      endDate: '2024-12-31T23:59:59.999Z',
    });
    await GET(request);

    expect(mockGetTransactionHistory).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        startDate: '2024-01-01T00:00:00.000Z',
        endDate: '2024-12-31T23:59:59.999Z',
      }),
    );
  });

  it('passes multiple filters conjunctively', async () => {
    mockGetTransactionHistory.mockResolvedValueOnce(mockHistoryResult);

    const request = buildRequest({
      direction: 'received',
      status: 'failed',
      page: '2',
    });
    await GET(request);

    expect(mockGetTransactionHistory).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        direction: 'received',
        status: 'FAILED',
        page: 2,
      }),
    );
  });

  it('returns 403 for ADMIN role', async () => {
    const request = buildRequest(undefined, { role: 'ADMIN' });
    const response = await GET(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('Forbidden');
  });

  it('returns 403 when role is missing', async () => {
    const request = buildRequest(undefined, { omitAuth: true });
    const response = await GET(request);

    expect(response.status).toBe(403);
  });

  it('returns 429 when rate limit is exceeded', async () => {
    const testUserId = 'rate-limit-history-user';
    for (let i = 0; i < 20; i++) {
      paymentRateLimiter.check(testUserId);
    }

    const request = buildRequest(undefined, { userId: testUserId });
    const response = await GET(request);

    expect(response.status).toBe(429);
    const data = await response.json();
    expect(data.error).toContain('Too many requests');
    expect(mockGetTransactionHistory).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid direction filter', async () => {
    const request = buildRequest({ direction: 'invalid' });
    const response = await GET(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Validation failed.');
  });

  it('returns 400 for invalid status filter', async () => {
    const request = buildRequest({ status: 'pending' });
    const response = await GET(request);

    expect(response.status).toBe(400);
  });

  it('returns 400 for invalid date format', async () => {
    const request = buildRequest({ startDate: 'not-a-date' });
    const response = await GET(request);

    expect(response.status).toBe(400);
  });

  it('returns 500 for unexpected errors', async () => {
    mockGetTransactionHistory.mockRejectedValueOnce(new Error('Database error'));

    const request = buildRequest();
    const response = await GET(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('unexpected error');
  });
});
