/**
 * Unit tests for POST /api/qr/dynamic route handler.
 *
 * Tests cover:
 * - Successful dynamic QR generation returns 200 with PNG image
 * - CSRF check rejects missing token with 403
 * - Role guard rejects USER role with 403
 * - Role guard rejects ADMIN role with 403
 * - Zod validation rejects invalid payloads with 400
 * - Invalid JSON body returns 400
 * - No wallet found returns 404
 * - Unexpected errors return 500
 */

import { POST } from '../dynamic/route';
import * as WalletServiceModule from '@/lib/services/wallet.service';
import * as QRServiceModule from '@/lib/services/qr.service';

// Mock WalletService and QRService
jest.mock('@/lib/services/wallet.service', () => {
  const actual = jest.requireActual('@/lib/services/wallet.service') as typeof WalletServiceModule;
  return {
    ...actual,
    getWalletDetails: jest.fn(),
  };
});

jest.mock('@/lib/services/qr.service', () => {
  const actual = jest.requireActual('@/lib/services/qr.service') as typeof QRServiceModule;
  return {
    ...actual,
    generateDynamicQR: jest.fn(),
  };
});

const mockGetWalletDetails = WalletServiceModule.getWalletDetails as jest.MockedFunction<
  typeof WalletServiceModule.getWalletDetails
>;
const mockGenerateDynamicQR = QRServiceModule.generateDynamicQR as jest.MockedFunction<
  typeof QRServiceModule.generateDynamicQR
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
    headers['x-user-id'] = options?.userId ?? 'merchant-1';
    headers['x-user-role'] = options?.role ?? 'MERCHANT';
  }

  return new Request('http://localhost/api/qr/dynamic', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

/**
 * Helper: builds a POST Request with invalid JSON body.
 */
function buildBadJsonRequest(): Request {
  return new Request('http://localhost/api/qr/dynamic', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': 'test-csrf-token',
      'x-user-id': 'merchant-1',
      'x-user-role': 'MERCHANT',
    },
    body: 'not-valid-json{{{',
  });
}

describe('POST /api/qr/dynamic', () => {
  const validPayload = { amount: 25.5, description: 'Coffee order' };

  it('returns 200 with PNG image on success', async () => {
    const mockPngBuffer = Buffer.from('mock_dynamic_qr_png');
    mockGetWalletDetails.mockResolvedValueOnce({
      stellarAddress: VALID_ADDRESS,
      balance: '10000.0000000',
    });
    mockGenerateDynamicQR.mockResolvedValueOnce(mockPngBuffer);

    const request = buildPostRequest(validPayload);
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Content-Length')).toBe(String(mockPngBuffer.length));
    expect(mockGetWalletDetails).toHaveBeenCalledWith('merchant-1');
    expect(mockGenerateDynamicQR).toHaveBeenCalledWith(VALID_ADDRESS, '25.5', 'Coffee order');
  });

  it('returns 200 without description', async () => {
    const mockPngBuffer = Buffer.from('mock_qr_png');
    mockGetWalletDetails.mockResolvedValueOnce({
      stellarAddress: VALID_ADDRESS,
      balance: '10000.0000000',
    });
    mockGenerateDynamicQR.mockResolvedValueOnce(mockPngBuffer);

    const request = buildPostRequest({ amount: 10 });
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockGenerateDynamicQR).toHaveBeenCalledWith(VALID_ADDRESS, '10', undefined);
  });

  it('returns 403 when CSRF token is missing', async () => {
    const request = buildPostRequest(validPayload, { omitCsrf: true });
    const response = await POST(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('CSRF');
    expect(mockGetWalletDetails).not.toHaveBeenCalled();
  });

  it('returns 403 for USER role', async () => {
    const request = buildPostRequest(validPayload, { role: 'USER' });
    const response = await POST(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('Forbidden');
    expect(mockGetWalletDetails).not.toHaveBeenCalled();
  });

  it('returns 403 for ADMIN role', async () => {
    const request = buildPostRequest(validPayload, { role: 'ADMIN' });
    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(mockGetWalletDetails).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON body', async () => {
    const request = buildBadJsonRequest();
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid JSON');
  });

  it('returns 400 when amount is missing', async () => {
    const request = buildPostRequest({ description: 'No amount' });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Validation failed.');
  });

  it('returns 400 when amount is negative', async () => {
    const request = buildPostRequest({ amount: -5 });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('returns 400 when amount is zero', async () => {
    const request = buildPostRequest({ amount: 0 });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('returns 404 when no wallet is found', async () => {
    mockGetWalletDetails.mockRejectedValueOnce(
      new Error('No wallet found for user merchant-1'),
    );

    const request = buildPostRequest(validPayload);
    const response = await POST(request);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain('No wallet found');
  });

  it('returns 500 for unexpected errors', async () => {
    mockGetWalletDetails.mockResolvedValueOnce({
      stellarAddress: VALID_ADDRESS,
      balance: '10000.0000000',
    });
    mockGenerateDynamicQR.mockRejectedValueOnce(new Error('QR generation failed'));

    const request = buildPostRequest(validPayload);
    const response = await POST(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('unexpected error');
  });
});
