/**
 * Unit tests for POST /api/qr/parse route handler.
 *
 * Tests cover:
 * - Successful QR parse returns 200 with address, amount, description
 * - CSRF check rejects missing token with 403
 * - Role guard rejects MERCHANT role with 403
 * - Role guard rejects ADMIN role with 403
 * - Missing 'data' field returns 400
 * - Invalid JSON body returns 400
 * - Malformed QR payload returns 400
 * - Invalid Stellar address in QR returns 400
 * - Unexpected errors return 500
 */

import { POST } from '../parse/route';
import * as QRServiceModule from '@/lib/services/qr.service';

// Mock QRService.parseQRPayload
jest.mock('@/lib/services/qr.service', () => {
  const actual = jest.requireActual('@/lib/services/qr.service') as typeof QRServiceModule;
  return {
    ...actual,
    parseQRPayload: jest.fn(),
  };
});

const mockParseQRPayload = QRServiceModule.parseQRPayload as jest.MockedFunction<
  typeof QRServiceModule.parseQRPayload
>;

const VALID_ADDRESS = `G${'A'.repeat(55)}`;

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

  return new Request('http://localhost/api/qr/parse', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

/**
 * Helper: builds a POST Request with invalid JSON body.
 */
function buildBadJsonRequest(): Request {
  return new Request('http://localhost/api/qr/parse', {
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

describe('POST /api/qr/parse', () => {
  it('returns 200 with parsed QR data (address only)', async () => {
    mockParseQRPayload.mockReturnValueOnce({ address: VALID_ADDRESS });

    const request = buildPostRequest({ data: `{"address":"${VALID_ADDRESS}"}` });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.address).toBe(VALID_ADDRESS);
    expect(data.amount).toBeUndefined();
    expect(data.description).toBeUndefined();
    expect(mockParseQRPayload).toHaveBeenCalledWith(`{"address":"${VALID_ADDRESS}"}`);
  });

  it('returns 200 with parsed QR data (address + amount + description)', async () => {
    mockParseQRPayload.mockReturnValueOnce({
      address: VALID_ADDRESS,
      amount: '25.5',
      description: 'Coffee',
    });

    const request = buildPostRequest({
      data: `{"address":"${VALID_ADDRESS}","amount":"25.5","description":"Coffee"}`,
    });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.address).toBe(VALID_ADDRESS);
    expect(data.amount).toBe('25.5');
    expect(data.description).toBe('Coffee');
  });

  it('returns 403 when CSRF token is missing', async () => {
    const request = buildPostRequest({ data: 'test' }, { omitCsrf: true });
    const response = await POST(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('CSRF');
    expect(mockParseQRPayload).not.toHaveBeenCalled();
  });

  it('returns 403 for MERCHANT role', async () => {
    const request = buildPostRequest({ data: 'test' }, { role: 'MERCHANT' });
    const response = await POST(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('Forbidden');
    expect(mockParseQRPayload).not.toHaveBeenCalled();
  });

  it('returns 403 for ADMIN role', async () => {
    const request = buildPostRequest({ data: 'test' }, { role: 'ADMIN' });
    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(mockParseQRPayload).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON body', async () => {
    const request = buildBadJsonRequest();
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid JSON');
  });

  it('returns 400 when data field is missing', async () => {
    const request = buildPostRequest({ notData: 'something' });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('"data" field');
  });

  it('returns 400 when data field is not a string', async () => {
    const request = buildPostRequest({ data: 12345 });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('"data" field');
  });

  it('returns 400 for malformed QR payload', async () => {
    mockParseQRPayload.mockImplementationOnce(() => {
      throw new Error('Invalid QR payload: data is not valid JSON');
    });

    const request = buildPostRequest({ data: 'not-json' });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid QR payload');
  });

  it('returns 400 for invalid Stellar address in QR', async () => {
    mockParseQRPayload.mockImplementationOnce(() => {
      throw new Error('Invalid Stellar address in QR payload: must be exactly 56 characters');
    });

    const request = buildPostRequest({ data: '{"address":"INVALID"}' });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid Stellar address');
  });

  it('returns 500 for unexpected errors', async () => {
    mockParseQRPayload.mockImplementationOnce(() => {
      throw new Error('Unexpected database error');
    });

    const request = buildPostRequest({ data: 'some-data' });
    const response = await POST(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('unexpected error');
  });
});
