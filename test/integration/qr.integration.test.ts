/**
 * Integration tests for the QR payment flow.
 *
 * Tests the full QR lifecycle through the API route handlers:
 * - Static QR generation: Merchant generates a QR encoding their Stellar address (PNG)
 * - Dynamic QR generation: Merchant generates a QR with amount and description (PNG)
 * - QR parse flow: User parses a valid QR payload → returns address, amount, description
 * - Invalid QR parse: Malformed or invalid Stellar address returns error
 * - QR round-trip: Generate QR payload → parse it → original data preserved
 *
 * External services (Stellar SDK) are mocked, but the actual service layer logic
 * (QRService, WalletService) is exercised end-to-end through the route handlers.
 *
 * @see Requirements 7.1–7.6
 */

import { GET as staticQRHandler } from '../../src/app/api/qr/static/route';
import { POST as dynamicQRHandler } from '../../src/app/api/qr/dynamic/route';
import { POST as parseQRHandler } from '../../src/app/api/qr/parse/route';
import { prisma } from '../../src/lib/prisma';

// ── Mock Stellar service (wallet details need getBalance) ───────────────

jest.mock('../../src/lib/services/stellar.service', () => ({
  generateKeypair: jest.fn().mockReturnValue({
    publicKey: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV',
    secretKey: 'SABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV',
  }),
  fundAccount: jest.fn().mockResolvedValue(undefined),
  getBalance: jest.fn().mockResolvedValue('10000.0000000'),
  submitPayment: jest.fn().mockResolvedValue({ transactionId: 'mock_tx' }),
  streamPayments: jest.fn(),
}));

jest.mock('../../src/lib/services/encryption.service', () => ({
  encrypt: jest.fn().mockReturnValue({
    ciphertext: 'mock_encrypted_secret',
    iv: 'mock_iv_hex',
    authTag: 'mock_auth_tag_hex',
  }),
  decrypt: jest.fn().mockReturnValue('mock_decrypted_secret'),
}));

// ── Typed references to mocked Prisma client ────────────────────────────

const mockPrisma = prisma as unknown as {
  wallet: {
    findUnique: jest.Mock;
  };
};

// ── Constants ────────────────────────────────────────────────────────────

const MERCHANT_USER_ID = 'merchant-integration-1';
const MERCHANT_STELLAR_ADDRESS = `G${'A'.repeat(55)}`;

// ── Helpers ──────────────────────────────────────────────────────────────

/** Builds a GET request with auth headers for the static QR endpoint. */
function buildStaticQRRequest(options?: {
  userId?: string;
  role?: string;
}): Request {
  const headers: Record<string, string> = {
    'x-user-id': options?.userId ?? MERCHANT_USER_ID,
    'x-user-role': options?.role ?? 'MERCHANT',
  };

  return new Request('http://localhost/api/qr/static', {
    method: 'GET',
    headers,
  });
}

/** Builds a POST request with JSON body and auth headers for the dynamic QR endpoint. */
function buildDynamicQRRequest(
  body: unknown,
  options?: {
    userId?: string;
    role?: string;
    omitCsrf?: boolean;
  },
): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-user-id': options?.userId ?? MERCHANT_USER_ID,
    'x-user-role': options?.role ?? 'MERCHANT',
  };

  if (!options?.omitCsrf) {
    headers['x-csrf-token'] = 'test-csrf-token';
  }

  return new Request('http://localhost/api/qr/dynamic', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

/** Builds a POST request with JSON body and auth headers for the QR parse endpoint. */
function buildParseQRRequest(
  body: unknown,
  options?: {
    userId?: string;
    role?: string;
    omitCsrf?: boolean;
  },
): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-user-id': options?.userId ?? 'user-1',
    'x-user-role': options?.role ?? 'USER',
  };

  if (!options?.omitCsrf) {
    headers['x-csrf-token'] = 'test-csrf-token';
  }

  return new Request('http://localhost/api/qr/parse', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

/** Sets up the mock wallet lookup so WalletService.getWalletDetails succeeds. */
function setupMerchantWallet(): void {
  mockPrisma.wallet.findUnique.mockImplementation(
    (args: { where: { userId?: string }; select?: unknown }) => {
      if (args.where.userId === MERCHANT_USER_ID) {
        // getWalletDetails uses select: { stellarAddress: true }
        return Promise.resolve({ stellarAddress: MERCHANT_STELLAR_ADDRESS });
      }
      return Promise.resolve(null);
    },
  );
}

// ── Test Suite ───────────────────────────────────────────────────────────

describe('QR Payment Flow Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-jwt-secret-for-integration-tests';
    process.env.ENCRYPTION_MASTER_KEY = 'test-encryption-master-key';
  });

  // ── Static QR Generation ────────────────────────────────────────────

  describe('Static QR generation (GET /api/qr/static)', () => {
    it('generates a PNG QR code encoding the merchant Stellar address', async () => {
      // Arrange: merchant has a wallet
      setupMerchantWallet();

      // Act
      const request = buildStaticQRRequest();
      const response = await staticQRHandler(request);

      // Assert: 200 with PNG image
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('image/png');

      // Verify the response body is a non-empty PNG buffer
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      expect(buffer.length).toBeGreaterThan(0);

      // PNG files start with the magic bytes: 0x89 0x50 0x4E 0x47
      expect(buffer[0]).toBe(0x89);
      expect(buffer[1]).toBe(0x50); // 'P'
      expect(buffer[2]).toBe(0x4e); // 'N'
      expect(buffer[3]).toBe(0x47); // 'G'

      // Verify wallet lookup was called for the merchant
      expect(mockPrisma.wallet.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: MERCHANT_USER_ID },
        }),
      );
    });

    it('returns 403 when a USER role tries to generate a static QR', async () => {
      const request = buildStaticQRRequest({ role: 'USER' });
      const response = await staticQRHandler(request);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toContain('Forbidden');
    });

    it('returns 404 when the merchant has no wallet', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue(null);

      const request = buildStaticQRRequest();
      const response = await staticQRHandler(request);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toContain('No wallet found');
    });
  });

  // ── Dynamic QR Generation ──────────────────────────────────────────

  describe('Dynamic QR generation (POST /api/qr/dynamic)', () => {
    it('generates a PNG QR code with amount and description', async () => {
      // Arrange: merchant has a wallet
      setupMerchantWallet();

      // Act
      const request = buildDynamicQRRequest({
        amount: 42.5,
        description: 'Coffee and pastry',
      });
      const response = await dynamicQRHandler(request);

      // Assert: 200 with PNG image
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('image/png');

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      expect(buffer.length).toBeGreaterThan(0);

      // Verify PNG magic bytes
      expect(buffer[0]).toBe(0x89);
      expect(buffer[1]).toBe(0x50);
      expect(buffer[2]).toBe(0x4e);
      expect(buffer[3]).toBe(0x47);
    });

    it('generates a PNG QR code with amount only (no description)', async () => {
      setupMerchantWallet();

      const request = buildDynamicQRRequest({ amount: 10 });
      const response = await dynamicQRHandler(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('image/png');
    });

    it('returns 403 when a USER role tries to generate a dynamic QR', async () => {
      const request = buildDynamicQRRequest({ amount: 10 }, { role: 'USER' });
      const response = await dynamicQRHandler(request);

      expect(response.status).toBe(403);
    });

    it('returns 400 when amount is missing', async () => {
      const request = buildDynamicQRRequest({ description: 'No amount' });
      const response = await dynamicQRHandler(request);

      expect(response.status).toBe(400);
    });

    it('returns 404 when the merchant has no wallet', async () => {
      mockPrisma.wallet.findUnique.mockResolvedValue(null);

      const request = buildDynamicQRRequest({ amount: 10 });
      const response = await dynamicQRHandler(request);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toContain('No wallet found');
    });
  });

  // ── QR Parse Flow ──────────────────────────────────────────────────

  describe('QR parse flow (POST /api/qr/parse)', () => {
    it('parses a valid QR payload with address only', async () => {
      const payload = JSON.stringify({ address: MERCHANT_STELLAR_ADDRESS });

      const request = buildParseQRRequest({ data: payload });
      const response = await parseQRHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.address).toBe(MERCHANT_STELLAR_ADDRESS);
      expect(data.amount).toBeUndefined();
      expect(data.description).toBeUndefined();
    });

    it('parses a valid QR payload with address, amount, and description', async () => {
      const payload = JSON.stringify({
        address: MERCHANT_STELLAR_ADDRESS,
        amount: '42.5',
        description: 'Coffee and pastry',
      });

      const request = buildParseQRRequest({ data: payload });
      const response = await parseQRHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.address).toBe(MERCHANT_STELLAR_ADDRESS);
      expect(data.amount).toBe('42.5');
      expect(data.description).toBe('Coffee and pastry');
    });

    it('returns 403 when a MERCHANT role tries to parse a QR', async () => {
      const payload = JSON.stringify({ address: MERCHANT_STELLAR_ADDRESS });

      const request = buildParseQRRequest({ data: payload }, { role: 'MERCHANT' });
      const response = await parseQRHandler(request);

      expect(response.status).toBe(403);
    });
  });

  // ── Invalid QR Parse ───────────────────────────────────────────────

  describe('Invalid QR parse (POST /api/qr/parse)', () => {
    it('returns 400 for malformed JSON in QR data', async () => {
      const request = buildParseQRRequest({ data: 'not-valid-json{{{' });
      const response = await parseQRHandler(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid QR payload');
    });

    it('returns 400 for invalid Stellar address (too short)', async () => {
      const payload = JSON.stringify({ address: 'GABC' });

      const request = buildParseQRRequest({ data: payload });
      const response = await parseQRHandler(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid Stellar address');
    });

    it('returns 400 for invalid Stellar address (wrong prefix)', async () => {
      // 56 chars but starts with 'S' instead of 'G'
      const badAddress = `S${'A'.repeat(55)}`;
      const payload = JSON.stringify({ address: badAddress });

      const request = buildParseQRRequest({ data: payload });
      const response = await parseQRHandler(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid Stellar address');
    });

    it('returns 400 when data field is missing from request body', async () => {
      const request = buildParseQRRequest({ notData: 'something' });
      const response = await parseQRHandler(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('"data" field');
    });

    it('returns 400 for QR payload missing the address field', async () => {
      const payload = JSON.stringify({ amount: '10', description: 'No address' });

      const request = buildParseQRRequest({ data: payload });
      const response = await parseQRHandler(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toContain('Invalid QR payload');
    });
  });

  // ── QR Round-Trip ──────────────────────────────────────────────────

  describe('QR round-trip: generate → parse preserves original data', () => {
    it('static QR round-trip: generate payload and parse returns original address', async () => {
      // The static QR encodes JSON: { "address": "<stellarAddress>" }
      // We simulate the round-trip by constructing the same payload the
      // QR service would encode, then parsing it through the parse endpoint.
      const expectedPayload = JSON.stringify({ address: MERCHANT_STELLAR_ADDRESS });

      const request = buildParseQRRequest({ data: expectedPayload });
      const response = await parseQRHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.address).toBe(MERCHANT_STELLAR_ADDRESS);
      expect(data.amount).toBeUndefined();
      expect(data.description).toBeUndefined();
    });

    it('dynamic QR round-trip: generate payload and parse returns original address, amount, and description', async () => {
      // The dynamic QR encodes JSON: { "address": "...", "amount": "...", "description": "..." }
      // We simulate the round-trip by constructing the same payload the
      // QR service would encode, then parsing it through the parse endpoint.
      const expectedPayload = JSON.stringify({
        address: MERCHANT_STELLAR_ADDRESS,
        amount: '99.99',
        description: 'Monthly subscription',
      });

      const request = buildParseQRRequest({ data: expectedPayload });
      const response = await parseQRHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.address).toBe(MERCHANT_STELLAR_ADDRESS);
      expect(data.amount).toBe('99.99');
      expect(data.description).toBe('Monthly subscription');
    });

    it('end-to-end: generate static QR via API, then parse the encoded payload', async () => {
      // Arrange: merchant has a wallet
      setupMerchantWallet();

      // Step 1: Generate a static QR via the API (returns PNG image)
      const staticRequest = buildStaticQRRequest();
      const staticResponse = await staticQRHandler(staticRequest);
      expect(staticResponse.status).toBe(200);
      expect(staticResponse.headers.get('Content-Type')).toBe('image/png');

      // Step 2: The QR image encodes JSON { "address": "<stellarAddress>" }.
      // In a real flow, the user's camera would decode this. We reconstruct
      // the payload that the QR service encoded and parse it.
      const scannedPayload = JSON.stringify({ address: MERCHANT_STELLAR_ADDRESS });

      const parseRequest = buildParseQRRequest({ data: scannedPayload });
      const parseResponse = await parseQRHandler(parseRequest);
      const parsedData = await parseResponse.json();

      // Assert: parsed data matches the merchant's Stellar address
      expect(parseResponse.status).toBe(200);
      expect(parsedData.address).toBe(MERCHANT_STELLAR_ADDRESS);
    });

    it('end-to-end: generate dynamic QR via API, then parse the encoded payload', async () => {
      // Arrange: merchant has a wallet
      setupMerchantWallet();

      // Step 1: Generate a dynamic QR via the API (returns PNG image)
      const dynamicRequest = buildDynamicQRRequest({
        amount: 75,
        description: 'Dinner for two',
      });
      const dynamicResponse = await dynamicQRHandler(dynamicRequest);
      expect(dynamicResponse.status).toBe(200);
      expect(dynamicResponse.headers.get('Content-Type')).toBe('image/png');

      // Step 2: The QR image encodes JSON { "address": "...", "amount": "75", "description": "Dinner for two" }.
      // Reconstruct the payload and parse it.
      const scannedPayload = JSON.stringify({
        address: MERCHANT_STELLAR_ADDRESS,
        amount: '75',
        description: 'Dinner for two',
      });

      const parseRequest = buildParseQRRequest({ data: scannedPayload });
      const parseResponse = await parseQRHandler(parseRequest);
      const parsedData = await parseResponse.json();

      // Assert: parsed data matches the original dynamic QR parameters
      expect(parseResponse.status).toBe(200);
      expect(parsedData.address).toBe(MERCHANT_STELLAR_ADDRESS);
      expect(parsedData.amount).toBe('75');
      expect(parsedData.description).toBe('Dinner for two');
    });
  });
});
