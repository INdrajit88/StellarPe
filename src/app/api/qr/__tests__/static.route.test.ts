/**
 * Unit tests for GET /api/qr/static route handler.
 *
 * Tests cover:
 * - Successful static QR generation returns 200 with PNG image
 * - Role guard rejects USER role with 403
 * - Role guard rejects ADMIN role with 403
 * - Role guard rejects missing role with 403
 * - No wallet found returns 404
 * - Unexpected errors return 500
 */

import { GET } from '../static/route';
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
    generateStaticQR: jest.fn(),
  };
});

const mockGetWalletDetails = WalletServiceModule.getWalletDetails as jest.MockedFunction<
  typeof WalletServiceModule.getWalletDetails
>;
const mockGenerateStaticQR = QRServiceModule.generateStaticQR as jest.MockedFunction<
  typeof QRServiceModule.generateStaticQR
>;

const VALID_ADDRESS = `G${'A'.repeat(55)}`;

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
    headers['x-user-id'] = options?.userId ?? 'merchant-1';
    headers['x-user-role'] = options?.role ?? 'MERCHANT';
  }

  return new Request('http://localhost/api/qr/static', {
    method: 'GET',
    headers,
  });
}

describe('GET /api/qr/static', () => {
  it('returns 200 with PNG image on success', async () => {
    const mockPngBuffer = Buffer.from('mock_png_data');
    mockGetWalletDetails.mockResolvedValueOnce({
      stellarAddress: VALID_ADDRESS,
      balance: '10000.0000000',
    });
    mockGenerateStaticQR.mockResolvedValueOnce(mockPngBuffer);

    const request = buildRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Content-Length')).toBe(String(mockPngBuffer.length));
    expect(mockGetWalletDetails).toHaveBeenCalledWith('merchant-1');
    expect(mockGenerateStaticQR).toHaveBeenCalledWith(VALID_ADDRESS);
  });

  it('returns 403 for USER role', async () => {
    const request = buildRequest({ role: 'USER' });
    const response = await GET(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('Forbidden');
    expect(mockGetWalletDetails).not.toHaveBeenCalled();
  });

  it('returns 403 for ADMIN role', async () => {
    const request = buildRequest({ role: 'ADMIN' });
    const response = await GET(request);

    expect(response.status).toBe(403);
    expect(mockGetWalletDetails).not.toHaveBeenCalled();
  });

  it('returns 403 when role is missing', async () => {
    const request = buildRequest({ omitAuth: true });
    const response = await GET(request);

    expect(response.status).toBe(403);
  });

  it('returns 404 when no wallet is found', async () => {
    mockGetWalletDetails.mockRejectedValueOnce(
      new Error('No wallet found for user merchant-1'),
    );

    const request = buildRequest();
    const response = await GET(request);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toContain('No wallet found');
  });

  it('returns 500 for unexpected errors', async () => {
    mockGetWalletDetails.mockResolvedValueOnce({
      stellarAddress: VALID_ADDRESS,
      balance: '10000.0000000',
    });
    mockGenerateStaticQR.mockRejectedValueOnce(new Error('QR generation failed'));

    const request = buildRequest();
    const response = await GET(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('unexpected error');
  });
});
