/**
 * Integration tests for admin management flow.
 *
 * Tests the admin lifecycle through the API route handlers:
 * - Deactivate account → login rejected for inactive account
 * - Reactivate account → login succeeds again
 * - Admin-only access enforcement (USER and MERCHANT get 403)
 * - Dashboard stats structure verification
 *
 * External services (Stellar SDK, Encryption) are mocked, but the actual
 * service layer logic (AdminService, AuthService) is exercised end-to-end
 * through the route handlers.
 *
 * @see Requirements 12.4, 12.5, 12.6
 */

import { GET as dashboardHandler } from '../../src/app/api/admin/dashboard/route';
import { GET as usersListHandler } from '../../src/app/api/admin/users/route';
import { PUT as userStatusHandler } from '../../src/app/api/admin/users/[id]/status/route';
import { POST as loginHandler } from '../../src/app/api/auth/login/route';
import { authRateLimiter } from '../../src/lib/middleware/rate-limiter';
import { prisma } from '../../src/lib/prisma';

// ── Mock Stellar and Encryption services ────────────────────────────────

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
  user: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    count: jest.Mock;
  };
  wallet: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
  transaction: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    count: jest.Mock;
    aggregate: jest.Mock;
  };
};

// ── Helpers ──────────────────────────────────────────────────────────────

const TARGET_USER_ID = 'user-target-1';

/** Builds a GET request with auth headers for admin endpoints. */
function buildGetRequest(
  url: string,
  options?: { role?: string; omitAuth?: boolean },
): Request {
  const headers: Record<string, string> = {};

  if (!options?.omitAuth) {
    headers['x-user-id'] = 'admin-1';
    headers['x-user-role'] = options?.role ?? 'ADMIN';
  }

  return new Request(url, { method: 'GET', headers });
}

/** Builds a PUT request with JSON body and auth headers. */
function buildPutRequest(
  url: string,
  body: unknown,
  options?: { role?: string; omitCsrf?: boolean; omitAuth?: boolean },
): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };

  if (!options?.omitCsrf) {
    headers['x-csrf-token'] = 'test-csrf-token';
  }

  if (!options?.omitAuth) {
    headers['x-user-id'] = 'admin-1';
    headers['x-user-role'] = options?.role ?? 'ADMIN';
  }

  return new Request(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
}

/** Builds a POST request for login. */
function buildLoginRequest(body: unknown): Request {
  return new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': 'test-csrf-token',
    },
    body: JSON.stringify(body),
  });
}

/** Builds the params promise matching Next.js dynamic route convention. */
function buildParams(id: string = TARGET_USER_ID): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

// ── Test Suite ───────────────────────────────────────────────────────────

describe('Admin Management Integration Tests', () => {
  let validPasswordHash: string;

  beforeAll(async () => {
    const bcrypt = await import('bcryptjs');
    validPasswordHash = await bcrypt.default.hash('securepassword123', 12);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    authRateLimiter.clear();

    process.env.JWT_SECRET = 'test-jwt-secret-for-integration-tests';
    process.env.ENCRYPTION_MASTER_KEY = 'test-encryption-master-key';
  });

  // ── Deactivate → Login Rejected, Reactivate → Login Succeeds ───────

  describe('Account deactivation and reactivation lifecycle', () => {
    it('deactivates an account, login is rejected, then reactivates and login succeeds', async () => {
      // ── Step 1: Admin deactivates the user account ──

      // Mock: user exists for setAccountStatus
      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: TARGET_USER_ID });
      mockPrisma.user.update.mockResolvedValueOnce({});

      const deactivateRequest = buildPutRequest(
        `http://localhost/api/admin/users/${TARGET_USER_ID}/status`,
        { status: 'INACTIVE' },
      );
      const deactivateResponse = await userStatusHandler(
        deactivateRequest,
        buildParams(),
      );
      const deactivateData = await deactivateResponse.json();

      expect(deactivateResponse.status).toBe(200);
      expect(deactivateData.message).toContain('INACTIVE');

      // Verify the user was updated to INACTIVE
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: TARGET_USER_ID },
        data: { status: 'INACTIVE' },
      });

      // ── Step 2: Deactivated user tries to login → rejected ──

      jest.clearAllMocks();

      // Mock: user exists but is INACTIVE
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: TARGET_USER_ID,
        username: 'targetuser',
        email: 'target@test.com',
        role: 'USER',
        status: 'INACTIVE',
        passwordHash: validPasswordHash,
        failedLoginAttempts: 0,
        loginLockedUntil: null,
      });

      const loginRequest = buildLoginRequest({
        email: 'target@test.com',
        password: 'securepassword123',
      });
      const loginResponse = await loginHandler(loginRequest);
      const loginData = await loginResponse.json();

      // Login should be rejected for inactive account (401)
      expect(loginResponse.status).toBe(401);
      expect(loginData.error).toBe('Invalid credentials.');
      expect(loginData.code).toBe('ACCOUNT_INACTIVE');

      // ── Step 3: Admin reactivates the account ──

      jest.clearAllMocks();

      // Mock: user exists for setAccountStatus
      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: TARGET_USER_ID });
      mockPrisma.user.update.mockResolvedValueOnce({});

      const reactivateRequest = buildPutRequest(
        `http://localhost/api/admin/users/${TARGET_USER_ID}/status`,
        { status: 'ACTIVE' },
      );
      const reactivateResponse = await userStatusHandler(
        reactivateRequest,
        buildParams(),
      );
      const reactivateData = await reactivateResponse.json();

      expect(reactivateResponse.status).toBe(200);
      expect(reactivateData.message).toContain('ACTIVE');

      // Verify the user was updated to ACTIVE
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: TARGET_USER_ID },
        data: { status: 'ACTIVE' },
      });

      // ── Step 4: Reactivated user can login again ──

      jest.clearAllMocks();

      // Mock: user exists and is now ACTIVE
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        id: TARGET_USER_ID,
        username: 'targetuser',
        email: 'target@test.com',
        role: 'USER',
        status: 'ACTIVE',
        passwordHash: validPasswordHash,
        failedLoginAttempts: 0,
        loginLockedUntil: null,
      });
      mockPrisma.user.update.mockResolvedValueOnce({});

      const loginAgainRequest = buildLoginRequest({
        email: 'target@test.com',
        password: 'securepassword123',
      });
      const loginAgainResponse = await loginHandler(loginAgainRequest);
      const loginAgainData = await loginAgainResponse.json();

      expect(loginAgainResponse.status).toBe(200);
      expect(loginAgainData.token).toBeDefined();
      expect(loginAgainData.token.split('.')).toHaveLength(3);
      expect(loginAgainData.user.id).toBe(TARGET_USER_ID);
      expect(loginAgainData.user.username).toBe('targetuser');
    });
  });

  // ── Admin-Only Access Enforcement ───────────────────────────────────

  describe('Admin-only access enforcement', () => {
    it('returns 403 when USER role accesses GET /api/admin/dashboard', async () => {
      const request = buildGetRequest(
        'http://localhost/api/admin/dashboard',
        { role: 'USER' },
      );
      const response = await dashboardHandler(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Forbidden');
      expect(mockPrisma.user.count).not.toHaveBeenCalled();
    });

    it('returns 403 when MERCHANT role accesses GET /api/admin/dashboard', async () => {
      const request = buildGetRequest(
        'http://localhost/api/admin/dashboard',
        { role: 'MERCHANT' },
      );
      const response = await dashboardHandler(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Forbidden');
    });

    it('returns 403 when USER role accesses GET /api/admin/users', async () => {
      const request = buildGetRequest(
        'http://localhost/api/admin/users',
        { role: 'USER' },
      );
      const response = await usersListHandler(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Forbidden');
    });

    it('returns 403 when MERCHANT role accesses GET /api/admin/users', async () => {
      const request = buildGetRequest(
        'http://localhost/api/admin/users',
        { role: 'MERCHANT' },
      );
      const response = await usersListHandler(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Forbidden');
    });

    it('returns 403 when USER role accesses PUT /api/admin/users/[id]/status', async () => {
      const request = buildPutRequest(
        `http://localhost/api/admin/users/${TARGET_USER_ID}/status`,
        { status: 'INACTIVE' },
        { role: 'USER' },
      );
      const response = await userStatusHandler(request, buildParams());
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Forbidden');
    });

    it('returns 403 when MERCHANT role accesses PUT /api/admin/users/[id]/status', async () => {
      const request = buildPutRequest(
        `http://localhost/api/admin/users/${TARGET_USER_ID}/status`,
        { status: 'INACTIVE' },
        { role: 'MERCHANT' },
      );
      const response = await userStatusHandler(request, buildParams());
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toContain('Forbidden');
    });

    it('returns 403 when no auth headers are present on admin endpoints', async () => {
      const dashboardReq = buildGetRequest(
        'http://localhost/api/admin/dashboard',
        { omitAuth: true },
      );
      const dashboardRes = await dashboardHandler(dashboardReq);
      expect(dashboardRes.status).toBe(403);

      const usersReq = buildGetRequest(
        'http://localhost/api/admin/users',
        { omitAuth: true },
      );
      const usersRes = await usersListHandler(usersReq);
      expect(usersRes.status).toBe(403);

      const statusReq = buildPutRequest(
        `http://localhost/api/admin/users/${TARGET_USER_ID}/status`,
        { status: 'ACTIVE' },
        { omitAuth: true },
      );
      const statusRes = await userStatusHandler(statusReq, buildParams());
      expect(statusRes.status).toBe(403);
    });

    it('allows ADMIN role to access all admin endpoints', async () => {
      // Dashboard
      const mockStats = {
        userCount: 10,
        merchantCount: 5,
        txCount: 100,
        volume: '5000.0000000',
        failedLast24h: 2,
      };
      mockPrisma.user.count
        .mockResolvedValueOnce(10)   // userCount (USER)
        .mockResolvedValueOnce(5);   // merchantCount (MERCHANT)
      mockPrisma.transaction.count
        .mockResolvedValueOnce(100)  // txCount
        .mockResolvedValueOnce(2);   // failedLast24h
      mockPrisma.transaction.aggregate.mockResolvedValueOnce({
        _sum: { amount: '5000.0000000' },
      });

      const dashboardReq = buildGetRequest('http://localhost/api/admin/dashboard');
      const dashboardRes = await dashboardHandler(dashboardReq);
      expect(dashboardRes.status).toBe(200);

      const dashboardData = await dashboardRes.json();
      expect(dashboardData.userCount).toBe(10);
      expect(dashboardData.merchantCount).toBe(5);
      expect(dashboardData.txCount).toBe(100);

      // Users list
      jest.clearAllMocks();
      mockPrisma.user.findMany.mockResolvedValueOnce([
        { id: 'u1', username: 'alice', email: 'alice@test.com', role: 'USER', status: 'ACTIVE', createdAt: new Date() },
      ]);
      mockPrisma.user.count.mockResolvedValueOnce(1);

      const usersReq = buildGetRequest('http://localhost/api/admin/users');
      const usersRes = await usersListHandler(usersReq);
      expect(usersRes.status).toBe(200);

      const usersData = await usersRes.json();
      expect(usersData.users).toHaveLength(1);
      expect(usersData.pagination).toBeDefined();
    });
  });

  // ── Dashboard Stats Structure ───────────────────────────────────────

  describe('Dashboard stats structure', () => {
    it('returns all expected stats fields from GET /api/admin/dashboard', async () => {
      mockPrisma.user.count
        .mockResolvedValueOnce(42)   // userCount (USER)
        .mockResolvedValueOnce(15);  // merchantCount (MERCHANT)
      mockPrisma.transaction.count
        .mockResolvedValueOnce(500)  // txCount
        .mockResolvedValueOnce(7);   // failedLast24h
      mockPrisma.transaction.aggregate.mockResolvedValueOnce({
        _sum: { amount: '12345.6789000' },
      });

      const request = buildGetRequest('http://localhost/api/admin/dashboard');
      const response = await dashboardHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);

      // Verify all expected fields are present
      expect(data).toHaveProperty('userCount', 42);
      expect(data).toHaveProperty('merchantCount', 15);
      expect(data).toHaveProperty('txCount', 500);
      expect(data).toHaveProperty('volume', '12345.6789000');
      expect(data).toHaveProperty('failedLast24h', 7);
    });

    it('returns volume as "0" when no completed transactions exist', async () => {
      mockPrisma.user.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockPrisma.transaction.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockPrisma.transaction.aggregate.mockResolvedValueOnce({
        _sum: { amount: null },
      });

      const request = buildGetRequest('http://localhost/api/admin/dashboard');
      const response = await dashboardHandler(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.volume).toBe('0');
      expect(data.userCount).toBe(0);
      expect(data.merchantCount).toBe(0);
      expect(data.txCount).toBe(0);
      expect(data.failedLast24h).toBe(0);
    });
  });
});
