/**
 * Unit tests for token API routes:
 * - POST /api/tokens/create
 * - GET /api/tokens/balances
 *
 * Tests cover:
 * - Create: success, validation errors (bad decimals, empty name), role guard (non-MERCHANT rejected)
 * - Balances: success with tokens, empty result, role guard
 *
 * @see Requirements 7.5, 7.6, 7.7
 */

import { POST as createPOST } from '../create/route';
import { GET as balancesGET } from '../balances/route';
import * as TokenServiceModule from '@/lib/services/token.service';

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('@/lib/services/token.service', () => {
  const actual = jest.requireActual(
    '@/lib/services/token.service',
  ) as typeof TokenServiceModule;
  return {
    ...actual,
    createToken: jest.fn(),
    getUserTokenBalances: jest.fn(),
  };
});

const mockCreateToken =
  TokenServiceModule.createToken as jest.MockedFunction<
    typeof TokenServiceModule.createToken
  >;
const mockGetUserTokenBalances =
  TokenServiceModule.getUserTokenBalances as jest.MockedFunction<
    typeof TokenServiceModule.getUserTokenBalances
  >;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Builds a POST Request with JSON body and auth headers.
 */
function buildPostRequest(
  url: string,
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
    headers['x-user-role'] = options?.role ?? 'MERCHANT';
  }

  return new Request(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

/**
 * Builds a GET Request with auth headers.
 */
function buildGetRequest(
  url: string,
  options?: {
    userId?: string;
    role?: string;
  },
): Request {
  const headers: Record<string, string> = {};

  headers['x-user-id'] = options?.userId ?? 'user-1';
  headers['x-user-role'] = options?.role ?? 'MERCHANT';

  return new Request(url, {
    method: 'GET',
    headers,
  });
}

// ─── Test Data ───────────────────────────────────────────────────────────────

const CREATE_URL = 'http://localhost/api/tokens/create';
const BALANCES_URL = 'http://localhost/api/tokens/balances';

const validCreatePayload = {
  name: 'StellarCoin',
  symbol: 'STC',
  decimals: 7,
  initialSupply: '1000000',
};

// ─── Create Route Tests ─────────────────────────────────────────────────────

describe('POST /api/tokens/create', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 with contractId and transactionHash on success', async () => {
    mockCreateToken.mockResolvedValueOnce({
      contractId: 'CTOKEN_CONTRACT_ID',
      transactionHash: 'tx-hash-create',
    });

    const request = buildPostRequest(CREATE_URL, validCreatePayload);
    const response = await createPOST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.contractId).toBe('CTOKEN_CONTRACT_ID');
    expect(data.transactionHash).toBe('tx-hash-create');
  });

  it('calls createToken with correct parameters', async () => {
    mockCreateToken.mockResolvedValueOnce({
      contractId: 'CTOKEN_CONTRACT_ID',
      transactionHash: 'tx-hash-create',
    });

    const request = buildPostRequest(CREATE_URL, validCreatePayload);
    await createPOST(request);

    expect(mockCreateToken).toHaveBeenCalledWith({
      name: 'StellarCoin',
      symbol: 'STC',
      decimals: 7,
      initialSupply: '1000000',
      merchantId: 'user-1',
    });
  });

  it('returns 403 when CSRF token is missing', async () => {
    const request = buildPostRequest(CREATE_URL, validCreatePayload, {
      omitCsrf: true,
    });
    const response = await createPOST(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('CSRF');
    expect(mockCreateToken).not.toHaveBeenCalled();
  });

  it('returns 403 for USER role (non-MERCHANT rejected)', async () => {
    const request = buildPostRequest(CREATE_URL, validCreatePayload, {
      role: 'USER',
    });
    const response = await createPOST(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('Forbidden');
    expect(mockCreateToken).not.toHaveBeenCalled();
  });

  it('returns 403 for ADMIN role', async () => {
    const request = buildPostRequest(CREATE_URL, validCreatePayload, {
      role: 'ADMIN',
    });
    const response = await createPOST(request);

    expect(response.status).toBe(403);
    expect(mockCreateToken).not.toHaveBeenCalled();
  });

  it('returns 400 when name is empty', async () => {
    const request = buildPostRequest(CREATE_URL, {
      ...validCreatePayload,
      name: '',
    });
    const response = await createPOST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Validation failed.');
    expect(mockCreateToken).not.toHaveBeenCalled();
  });

  it('returns 400 when decimals is negative', async () => {
    const request = buildPostRequest(CREATE_URL, {
      ...validCreatePayload,
      decimals: -1,
    });
    const response = await createPOST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Validation failed.');
    expect(mockCreateToken).not.toHaveBeenCalled();
  });

  it('returns 400 when decimals exceeds 18', async () => {
    const request = buildPostRequest(CREATE_URL, {
      ...validCreatePayload,
      decimals: 19,
    });
    const response = await createPOST(request);

    expect(response.status).toBe(400);
    expect(mockCreateToken).not.toHaveBeenCalled();
  });

  it('returns 400 when decimals is not an integer', async () => {
    const request = buildPostRequest(CREATE_URL, {
      ...validCreatePayload,
      decimals: 7.5,
    });
    const response = await createPOST(request);

    expect(response.status).toBe(400);
    expect(mockCreateToken).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON body', async () => {
    const request = new Request(CREATE_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': 'test-csrf-token',
        'x-user-id': 'user-1',
        'x-user-role': 'MERCHANT',
      },
      body: 'not-valid-json{{{',
    });
    const response = await createPOST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid JSON');
  });

  it('returns 500 for unexpected errors', async () => {
    mockCreateToken.mockRejectedValueOnce(
      new Error('Database connection failed'),
    );

    const request = buildPostRequest(CREATE_URL, validCreatePayload);
    const response = await createPOST(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('unexpected error');
  });
});

// ─── Balances Route Tests ────────────────────────────────────────────────────

describe('GET /api/tokens/balances', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 with token balances on success', async () => {
    const mockBalances = [
      {
        contractId: 'CTOKEN_1',
        name: 'StellarCoin',
        symbol: 'STC',
        decimals: 7,
        balance: '1000000',
      },
      {
        contractId: 'CTOKEN_2',
        name: 'LunarToken',
        symbol: 'LNR',
        decimals: 8,
        balance: '500000',
      },
    ];
    mockGetUserTokenBalances.mockResolvedValueOnce(mockBalances);

    const request = buildGetRequest(BALANCES_URL);
    const response = await balancesGET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(2);
    expect(data[0].contractId).toBe('CTOKEN_1');
    expect(data[0].name).toBe('StellarCoin');
    expect(data[1].contractId).toBe('CTOKEN_2');
  });

  it('returns 200 with empty array when user has no tokens', async () => {
    mockGetUserTokenBalances.mockResolvedValueOnce([]);

    const request = buildGetRequest(BALANCES_URL);
    const response = await balancesGET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });

  it('calls getUserTokenBalances with the authenticated user ID', async () => {
    mockGetUserTokenBalances.mockResolvedValueOnce([]);

    const request = buildGetRequest(BALANCES_URL, { userId: 'merchant-42' });
    await balancesGET(request);

    expect(mockGetUserTokenBalances).toHaveBeenCalledWith('merchant-42');
  });

  it('allows USER role to access balances', async () => {
    mockGetUserTokenBalances.mockResolvedValueOnce([]);

    const request = buildGetRequest(BALANCES_URL, { role: 'USER' });
    const response = await balancesGET(request);

    expect(response.status).toBe(200);
  });

  it('allows MERCHANT role to access balances', async () => {
    mockGetUserTokenBalances.mockResolvedValueOnce([]);

    const request = buildGetRequest(BALANCES_URL, { role: 'MERCHANT' });
    const response = await balancesGET(request);

    expect(response.status).toBe(200);
  });

  it('returns 403 for ADMIN role', async () => {
    const request = buildGetRequest(BALANCES_URL, { role: 'ADMIN' });
    const response = await balancesGET(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('Forbidden');
    expect(mockGetUserTokenBalances).not.toHaveBeenCalled();
  });

  it('returns 500 for unexpected errors', async () => {
    mockGetUserTokenBalances.mockRejectedValueOnce(
      new Error('RPC connection failed'),
    );

    const request = buildGetRequest(BALANCES_URL);
    const response = await balancesGET(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('unexpected error');
  });
});
