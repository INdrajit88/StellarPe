/**
 * Integration tests for the authentication flow.
 *
 * Tests the full auth lifecycle through the API route handlers:
 * - Registration → wallet creation → Friendbot funding → JWT issuance
 * - Login with valid/invalid credentials
 * - Account lockout after 5 consecutive failed login attempts
 * - Duplicate registration rejection
 * - Missing required fields validation
 *
 * External services (Stellar SDK, Friendbot) are mocked, but the actual
 * service layer logic (AuthService, WalletService) is exercised end-to-end.
 *
 * @see Requirements 1.1–1.7, 2.1, 2.2
 */

import { POST as registerHandler } from '../../src/app/api/auth/register/route';
import { POST as loginHandler } from '../../src/app/api/auth/login/route';
import { authRateLimiter } from '../../src/lib/middleware/rate-limiter';
import { prisma } from '../../src/lib/prisma';
import * as StellarService from '../../src/lib/services/stellar.service';
import * as EncryptionService from '../../src/lib/services/encryption.service';

// ── Mock Stellar and Encryption services ────────────────────────────────
// These are external dependencies; we mock them so integration tests
// exercise the auth/wallet logic without hitting the real Stellar network.

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
};

// ── Helpers ──────────────────────────────────────────────────────────────

/** Builds a POST request with JSON body and standard headers. */
function buildRequest(
  url: string,
  body: unknown,
  options?: { omitCsrf?: boolean; ip?: string },
): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (!options?.omitCsrf) {
    headers['x-csrf-token'] = 'test-csrf-token';
  }
  if (options?.ip) {
    headers['x-forwarded-for'] = options.ip;
  }
  return new Request(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

const REGISTER_URL = 'http://localhost/api/auth/register';
const LOGIN_URL = 'http://localhost/api/auth/login';

const validRegistration = {
  username: 'integrationuser',
  email: 'integration@test.com',
  password: 'securepassword123',
  role: 'USER',
};

const validLogin = {
  email: 'integration@test.com',
  password: 'securepassword123',
};

// ── Test Suite ───────────────────────────────────────────────────────────

describe('Auth Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authRateLimiter.clear();

    // Set JWT_SECRET for token signing
    process.env.JWT_SECRET = 'test-jwt-secret-for-integration-tests';
    process.env.ENCRYPTION_MASTER_KEY = 'test-encryption-master-key';
  });

  // ── Registration Flow ───────────────────────────────────────────────

  describe('Registration → Wallet Creation → JWT Issuance', () => {
    it('creates a user, triggers wallet creation with Stellar keypair and Friendbot funding, and returns a valid JWT', async () => {
      // Arrange: no existing user with this username or email
      mockPrisma.user.findUnique.mockResolvedValue(null);

      // Mock user creation
      const createdUser = {
        id: 'user-integration-1',
        username: 'integrationuser',
        email: 'integration@test.com',
        role: 'USER',
      };
      mockPrisma.user.create.mockResolvedValue(createdUser);

      // Mock wallet creation
      mockPrisma.wallet.create.mockResolvedValue({
        id: 'wallet-1',
        userId: 'user-integration-1',
        stellarAddress: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV',
        encryptedSecretKey: 'mock_encrypted_secret',
        encryptionIV: 'mock_iv_hex',
        authTag: 'mock_auth_tag_hex',
      });

      // Act
      const request = buildRequest(REGISTER_URL, validRegistration);
      const response = await registerHandler(request);
      const data = await response.json();

      // Assert: 201 Created with user and token
      expect(response.status).toBe(201);
      expect(data.user).toEqual(createdUser);
      expect(data.token).toBeDefined();
      expect(typeof data.token).toBe('string');
      expect(data.token.split('.')).toHaveLength(3); // JWT has 3 parts

      // Verify Stellar keypair was generated
      expect(StellarService.generateKeypair).toHaveBeenCalledTimes(1);

      // Verify Friendbot funding was triggered
      expect(StellarService.fundAccount).toHaveBeenCalledWith(
        'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV',
      );

      // Verify secret key was encrypted before storage
      expect(EncryptionService.encrypt).toHaveBeenCalledWith(
        'SABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV',
      );

      // Verify wallet was stored with encrypted data
      expect(mockPrisma.wallet.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-integration-1',
          stellarAddress: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV',
          encryptedSecretKey: 'mock_encrypted_secret',
          encryptionIV: 'mock_iv_hex',
          authTag: 'mock_auth_tag_hex',
        }),
      });

      // Verify the JWT can be decoded and contains correct claims
      const jwt = await import('jsonwebtoken');
      const decoded = jwt.default.verify(data.token, process.env.JWT_SECRET!) as {
        userId: string;
        role: string;
        exp: number;
        iat: number;
      };
      expect(decoded.userId).toBe('user-integration-1');
      expect(decoded.role).toBe('USER');

      // JWT expiry should be ≤ 24 hours from issuance
      const expiryDuration = decoded.exp - decoded.iat;
      expect(expiryDuration).toBeLessThanOrEqual(24 * 60 * 60);
    });
  });

  // ── Login Flow ──────────────────────────────────────────────────────

  describe('Login with valid/invalid credentials', () => {
    // bcrypt hash of 'securepassword123' with cost factor 12
    let validPasswordHash: string;

    beforeAll(async () => {
      const bcrypt = await import('bcryptjs');
      validPasswordHash = await bcrypt.default.hash('securepassword123', 12);
    });

    it('returns a JWT and user data on successful login', async () => {
      // Arrange: user exists with valid password hash
      const existingUser = {
        id: 'user-login-1',
        username: 'loginuser',
        email: 'integration@test.com',
        role: 'USER',
        status: 'ACTIVE',
        passwordHash: validPasswordHash,
        failedLoginAttempts: 0,
        loginLockedUntil: null,
      };
      mockPrisma.user.findUnique.mockResolvedValue(existingUser);
      mockPrisma.user.update.mockResolvedValue(existingUser);

      // Act
      const request = buildRequest(LOGIN_URL, validLogin);
      const response = await loginHandler(request);
      const data = await response.json();

      // Assert: 200 OK with token and user
      expect(response.status).toBe(200);
      expect(data.token).toBeDefined();
      expect(data.token.split('.')).toHaveLength(3);
      expect(data.user).toEqual({
        id: 'user-login-1',
        username: 'loginuser',
        email: 'integration@test.com',
        role: 'USER',
      });

      // Verify failed attempts were reset
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-login-1' },
        data: {
          failedLoginAttempts: 0,
          loginLockedUntil: null,
        },
      });
    });

    it('returns generic 401 for invalid password without revealing which field is wrong', async () => {
      // Arrange: user exists but password won't match
      const existingUser = {
        id: 'user-login-2',
        username: 'loginuser2',
        email: 'wrong@test.com',
        role: 'USER',
        status: 'ACTIVE',
        passwordHash: validPasswordHash,
        failedLoginAttempts: 0,
        loginLockedUntil: null,
      };
      mockPrisma.user.findUnique.mockResolvedValue(existingUser);
      mockPrisma.user.update.mockResolvedValue(existingUser);

      // Act
      const request = buildRequest(LOGIN_URL, {
        email: 'wrong@test.com',
        password: 'wrongpassword123',
      });
      const response = await loginHandler(request);
      const data = await response.json();

      // Assert: generic 401
      expect(response.status).toBe(401);
      expect(data.error).toBe('Invalid credentials.');
      // Must NOT reveal whether email or password was wrong
      expect(data.error).not.toContain('email');
      expect(data.error).not.toContain('password');
    });

    it('returns generic 401 for non-existent email', async () => {
      // Arrange: no user found
      mockPrisma.user.findUnique.mockResolvedValue(null);

      // Act
      const request = buildRequest(LOGIN_URL, {
        email: 'nonexistent@test.com',
        password: 'anypassword123',
      });
      const response = await loginHandler(request);
      const data = await response.json();

      // Assert: generic 401
      expect(response.status).toBe(401);
      expect(data.error).toBe('Invalid credentials.');
    });
  });

  // ── Account Lockout ─────────────────────────────────────────────────

  describe('Account lockout after 5 consecutive failed login attempts', () => {
    let validPasswordHash: string;

    beforeAll(async () => {
      const bcrypt = await import('bcryptjs');
      validPasswordHash = await bcrypt.default.hash('securepassword123', 12);
    });

    it('locks the account after 5 consecutive failed attempts and returns 423', async () => {
      // We simulate the progression of failed attempts by updating the
      // mock return value for each call to reflect the incrementing counter.
      let failedAttempts = 0;

      mockPrisma.user.findUnique.mockImplementation(() => {
        return Promise.resolve({
          id: 'user-lockout-1',
          username: 'lockoutuser',
          email: 'lockout@test.com',
          role: 'USER',
          status: 'ACTIVE',
          passwordHash: validPasswordHash,
          failedLoginAttempts: failedAttempts,
          loginLockedUntil: null,
        });
      });

      mockPrisma.user.update.mockImplementation((args: { data: { failedLoginAttempts: number } }) => {
        failedAttempts = args.data.failedLoginAttempts;
        return Promise.resolve({});
      });

      // Make 5 failed login attempts with wrong password
      for (let i = 0; i < 5; i++) {
        const request = buildRequest(LOGIN_URL, {
          email: 'lockout@test.com',
          password: 'wrongpassword',
        });
        const response = await loginHandler(request);
        expect(response.status).toBe(401);
      }

      // Verify the 5th attempt triggered lockout (update with loginLockedUntil set)
      const lastUpdateCall = mockPrisma.user.update.mock.calls[4];
      expect(lastUpdateCall[0].data.failedLoginAttempts).toBe(5);
      expect(lastUpdateCall[0].data.loginLockedUntil).toBeInstanceOf(Date);

      // Now simulate the locked state: the next login attempt should get 423
      const lockUntil = new Date();
      lockUntil.setMinutes(lockUntil.getMinutes() + 15);

      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-lockout-1',
        username: 'lockoutuser',
        email: 'lockout@test.com',
        role: 'USER',
        status: 'ACTIVE',
        passwordHash: validPasswordHash,
        failedLoginAttempts: 5,
        loginLockedUntil: lockUntil,
      });

      const lockedRequest = buildRequest(LOGIN_URL, {
        email: 'lockout@test.com',
        password: 'securepassword123', // even correct password should be rejected
      });
      const lockedResponse = await loginHandler(lockedRequest);
      const lockedData = await lockedResponse.json();

      expect(lockedResponse.status).toBe(423);
      expect(lockedData.error).toContain('locked');
      expect(lockedData.code).toBe('ACCOUNT_LOCKED');
    });
  });

  // ── Duplicate Registration ──────────────────────────────────────────

  describe('Duplicate registration rejection', () => {
    it('returns 409 with descriptive error for duplicate username', async () => {
      // Arrange: first findUnique (username check) returns existing user
      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'existing-user' });

      // Act
      const request = buildRequest(REGISTER_URL, validRegistration);
      const response = await registerHandler(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(409);
      expect(data.error).toContain('Username');
      expect(data.code).toBe('DUPLICATE_USERNAME');
    });

    it('returns 409 with descriptive error for duplicate email', async () => {
      // Arrange: first findUnique (username check) returns null,
      // second findUnique (email check) returns existing user
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(null)           // username check — not taken
        .mockResolvedValueOnce({ id: 'existing-user' }); // email check — taken

      // Act
      const request = buildRequest(REGISTER_URL, validRegistration);
      const response = await registerHandler(request);
      const data = await response.json();

      // Assert
      expect(response.status).toBe(409);
      expect(data.error).toContain('Email');
      expect(data.code).toBe('DUPLICATE_EMAIL');
    });
  });

  // ── Missing Fields ──────────────────────────────────────────────────

  describe('Missing required fields validation', () => {
    it('returns 400 with field names when username is missing', async () => {
      const request = buildRequest(REGISTER_URL, {
        email: 'test@example.com',
        password: 'securepassword123',
        role: 'USER',
      });
      const response = await registerHandler(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation failed.');
      expect(data.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'username' }),
        ]),
      );
    });

    it('returns 400 with field names when email is missing', async () => {
      const request = buildRequest(REGISTER_URL, {
        username: 'testuser',
        password: 'securepassword123',
        role: 'USER',
      });
      const response = await registerHandler(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'email' }),
        ]),
      );
    });

    it('returns 400 with field names when password is missing', async () => {
      const request = buildRequest(REGISTER_URL, {
        username: 'testuser',
        email: 'test@example.com',
        role: 'USER',
      });
      const response = await registerHandler(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'password' }),
        ]),
      );
    });

    it('returns 400 with field names when role is missing', async () => {
      const request = buildRequest(REGISTER_URL, {
        username: 'testuser',
        email: 'test@example.com',
        password: 'securepassword123',
      });
      const response = await registerHandler(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'role' }),
        ]),
      );
    });

    it('returns 400 listing all missing fields when body is empty', async () => {
      const request = buildRequest(REGISTER_URL, {});
      const response = await registerHandler(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Validation failed.');
      expect(data.details.length).toBeGreaterThanOrEqual(4);

      const fieldNames = data.details.map((d: { field: string }) => d.field);
      expect(fieldNames).toContain('username');
      expect(fieldNames).toContain('email');
      expect(fieldNames).toContain('password');
      expect(fieldNames).toContain('role');
    });

    it('returns 400 for login with missing email', async () => {
      const request = buildRequest(LOGIN_URL, { password: 'test123456' });
      const response = await loginHandler(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'email' }),
        ]),
      );
    });

    it('returns 400 for login with missing password', async () => {
      const request = buildRequest(LOGIN_URL, { email: 'test@example.com' });
      const response = await loginHandler(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'password' }),
        ]),
      );
    });
  });
});
