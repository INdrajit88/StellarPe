/**
 * Unit tests for POST /api/payments/send route handler.
 *
 * Tests cover:
 * - Successful payment returns 200 with transaction details
 * - CSRF check rejects missing token with 403
 * - Role guard rejects MERCHANT and ADMIN with 403
 * - Rate limiter returns 429 when exceeded
 * - Zod validation rejects invalid payloads with 400
 * - Invalid JSON body returns 400
 * - PaymentError mapped to correct status codes (400, 423, 502)
 * - Unexpected errors return 500
 */

import { POST } from '../send/route';
import * as PaymentServiceModule from '@/lib/services/payment.service';
import { PaymentError, PaymentErrorCode } from '@/lib/services/payment.service';
import { paymentRateLimiter } from '@/lib/middleware/rate-limiter';

// Mock PaymentService.sendPayment
jest.mock('@/lib/services/payment.service', () => {
  const actual = jest.requireActual('@/lib/services/payment.service') as typeof PaymentServiceModule;
  return {
    ...actual,
    sendPayment: jest.fn(),
  };
});

const mockSendPayment = PaymentServiceModule.sendPayment as jest.MockedFunction<
  typeof PaymentServiceModule.sendPayment
>;

/**
 * Helper: builds a POST Request with JSON body and auth headers.
 */
function buildRequest(
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

  return new Request('http://localhost/api/payments/send', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

/**
 * Helper: builds a Request with an invalid JSON body.
 */
function buildBadJsonRequest(): Request {
  return new Request('http://localhost/api/payments/send', {
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

describe('POST /api/payments/send', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    paymentRateLimiter.clear();
  });

  const validPayload = {
    recipient: 'alice',
    amount: 10.5,
    pin: '1234',
    memo: 'Test payment',
  };

  it('returns 200 with transaction on successful payment', async () => {
    const mockTransaction = {
      id: 'tx-1',
      stellarTxId: 'stellar-tx-abc',
      amount: 10.5,
      status: 'COMPLETED',
    };
    mockSendPayment.mockResolvedValueOnce({ transaction: mockTransaction });

    const request = buildRequest(validPayload);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.transaction).toEqual(mockTransaction);
    expect(mockSendPayment).toHaveBeenCalledWith({
      senderId: 'user-1',
      recipient: 'alice',
      amount: '10.5',
      pin: '1234',
      memo: 'Test payment',
    });
  });

  it('passes amount as string to service', async () => {
    mockSendPayment.mockResolvedValueOnce({ transaction: { id: 'tx-1' } });

    const request = buildRequest({ ...validPayload, amount: 100 });
    await POST(request);

    expect(mockSendPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: '100' }),
    );
  });

  it('returns 403 when CSRF token is missing', async () => {
    const request = buildRequest(validPayload, { omitCsrf: true });
    const response = await POST(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('CSRF');
    expect(mockSendPayment).not.toHaveBeenCalled();
  });

  it('returns 403 for MERCHANT role', async () => {
    const request = buildRequest(validPayload, { role: 'MERCHANT' });
    const response = await POST(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('Forbidden');
  });

  it('returns 403 for ADMIN role', async () => {
    const request = buildRequest(validPayload, { role: 'ADMIN' });
    const response = await POST(request);

    expect(response.status).toBe(403);
  });

  it('returns 400 for invalid JSON body', async () => {
    const request = buildBadJsonRequest();
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid JSON');
  });

  it('returns 400 when recipient is missing', async () => {
    const request = buildRequest({ amount: 10, pin: '1234' });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Validation failed.');
    expect(data.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'recipient' }),
      ]),
    );
  });

  it('returns 400 when amount is missing', async () => {
    const request = buildRequest({ recipient: 'alice', pin: '1234' });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'amount' }),
      ]),
    );
  });

  it('returns 400 when PIN is missing', async () => {
    const request = buildRequest({ recipient: 'alice', amount: 10 });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'pin' }),
      ]),
    );
  });

  it('returns 400 when amount is negative', async () => {
    const request = buildRequest({ recipient: 'alice', amount: -5, pin: '1234' });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('returns 400 when PIN format is invalid', async () => {
    const request = buildRequest({ recipient: 'alice', amount: 10, pin: 'abc' });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'pin' }),
      ]),
    );
  });

  it('returns 429 when rate limit is exceeded', async () => {
    const testUserId = 'rate-limit-payment-user';
    for (let i = 0; i < 20; i++) {
      paymentRateLimiter.check(testUserId);
    }

    const request = buildRequest(validPayload, { userId: testUserId });
    const response = await POST(request);

    expect(response.status).toBe(429);
    const data = await response.json();
    expect(data.error).toContain('Too many requests');
    expect(mockSendPayment).not.toHaveBeenCalled();
  });

  it('returns 400 for insufficient balance', async () => {
    mockSendPayment.mockRejectedValueOnce(
      new PaymentError(
        'Insufficient balance.',
        PaymentErrorCode.INSUFFICIENT_BALANCE,
        400,
      ),
    );

    const request = buildRequest(validPayload);
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Insufficient balance');
    expect(data.code).toBe(PaymentErrorCode.INSUFFICIENT_BALANCE);
  });

  it('returns 400 for incorrect PIN', async () => {
    mockSendPayment.mockRejectedValueOnce(
      new PaymentError(
        'Incorrect transaction PIN.',
        PaymentErrorCode.INCORRECT_PIN,
        400,
      ),
    );

    const request = buildRequest(validPayload);
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.code).toBe(PaymentErrorCode.INCORRECT_PIN);
  });

  it('returns 423 for locked account', async () => {
    mockSendPayment.mockRejectedValueOnce(
      new PaymentError(
        'Account is temporarily locked.',
        PaymentErrorCode.ACCOUNT_LOCKED,
        423,
      ),
    );

    const request = buildRequest(validPayload);
    const response = await POST(request);

    expect(response.status).toBe(423);
    const data = await response.json();
    expect(data.code).toBe(PaymentErrorCode.ACCOUNT_LOCKED);
  });

  it('returns 502 for Stellar submission failure', async () => {
    mockSendPayment.mockRejectedValueOnce(
      new PaymentError(
        'Payment failed: tx_failed',
        PaymentErrorCode.STELLAR_SUBMISSION_FAILED,
        502,
      ),
    );

    const request = buildRequest(validPayload);
    const response = await POST(request);

    expect(response.status).toBe(502);
    const data = await response.json();
    expect(data.code).toBe(PaymentErrorCode.STELLAR_SUBMISSION_FAILED);
  });

  it('returns 500 for unexpected errors', async () => {
    mockSendPayment.mockRejectedValueOnce(new Error('Database connection failed'));

    const request = buildRequest(validPayload);
    const response = await POST(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('unexpected error');
  });
});
