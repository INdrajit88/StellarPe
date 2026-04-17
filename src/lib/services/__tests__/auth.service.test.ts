/**
 * Unit tests for AuthService.
 *
 * Validates registration, login, token validation, duplicate detection,
 * lockout enforcement, and session invalidation.
 *
 * Uses the Prisma mock from test/setup.ts — no real database connection needed.
 *
 * @see Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 13.5
 */

import { jest } from '@jest/globals';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// ─── Mock setup ──────────────────────────────────────────────────────────────

// Mock WalletService.createWallet to avoid Stellar/Friendbot calls.
const mockCreateWallet = jest.fn<(userId: string) => Promise<{ publicKey: string }>>();

jest.mock('../wallet.service', () => ({
  __esModule: true,
  createWallet: (...args: unknown[]) => mockCreateWallet(...(args as [string])),
}));

// Set JWT_SECRET for tests before importing the service.
process.env.JWT_SECRET = 'test-jwt-secret-for-auth-service-unit-tests';

import {
  register,
  login,
  validateToken,
  validateTokenWithSession,
  AuthError,
  AuthErrorCode,
} from '../auth.service';
import { prisma } from '@/lib/prisma';

// ─── Type helpers ────────────────────────────────────────────────────────────

const mockPrisma = prisma as unknown as {
  user: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
};

// ─── Test constants ──────────────────────────────────────────────────────────

const TEST_JWT_SECRET = 'test-jwt-secret-for-auth-service-unit-tests';

const VALID_REGISTRATION = {
  username: 'testuser',
  email: 'test@example.com',
  password: 'securepassword123',
  role: 'USER',
};

const VALID_LOGIN = {
  email: 'test@example.com',
  password: 'securepassword123',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildMockUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user_1',
    username: 'testuser',
    email: 'test@example.com',
    role: 'USER',
    status: 'ACTIVE',
    passwordHash: '$2b$12$placeholder',
    failedLoginAttempts: 0,
    loginLockedUntil: null,
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateWallet.mockResolvedValue({ publicKey: `G${'A'.repeat(55)}` });
  });

  // ── register ──────────────────────────────────────────────────────────

  describe('register()', () => {
    beforeEach(() => {
      // Default: no duplicate username or email.
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: 'user_1',
        username: VALID_REGISTRATION.username,
        email: VALID_REGISTRATION.email,
        role: VALID_REGISTRATION.role,
      });
    });

    it('creates a user with a bcrypt-hashed password', async () => {
      await register(VALID_REGISTRATION);

      expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
      const createCall = mockPrisma.user.create.mock.calls[0][0];
      const storedHash = createCall.data.passwordHash as string;

      // Verify it's a valid bcrypt hash.
      expect(storedHash).toMatch(/^\$2[aby]?\$/);

      // Verify the original password matches the hash.
      const matches = await bcrypt.compare(VALID_REGISTRATION.password, storedHash);
      expect(matches).toBe(true);
    });

    it('uses bcrypt cost factor of at least 12', async () => {
      await register(VALID_REGISTRATION);

      const createCall = mockPrisma.user.create.mock.calls[0][0];
      const storedHash = createCall.data.passwordHash as string;
      const costStr = storedHash.split('$')[2];
      const cost = parseInt(costStr, 10);
      expect(cost).toBeGreaterThanOrEqual(12);
    });

    it('triggers wallet creation for the new user', async () => {
      await register(VALID_REGISTRATION);
      expect(mockCreateWallet).toHaveBeenCalledWith('user_1');
    });

    it('returns a valid JWT with userId and role claims', async () => {
      const result = await register(VALID_REGISTRATION);

      expect(result.token).toBeDefined();
      const decoded = jwt.verify(result.token, TEST_JWT_SECRET) as {
        userId: string;
        role: string;
      };
      expect(decoded.userId).toBe('user_1');
      expect(decoded.role).toBe('USER');
    });

    it('returns user data without passwordHash', async () => {
      const result = await register(VALID_REGISTRATION);

      expect(result.user).toEqual({
        id: 'user_1',
        username: 'testuser',
        email: 'test@example.com',
        role: 'USER',
      });
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('returns JWT with expiry of no more than 24 hours', async () => {
      const result = await register(VALID_REGISTRATION);

      const decoded = jwt.decode(result.token) as {
        iat: number;
        exp: number;
      };
      const expirySeconds = decoded.exp - decoded.iat;
      expect(expirySeconds).toBeLessThanOrEqual(24 * 60 * 60);
      expect(expirySeconds).toBeGreaterThan(0);
    });

    it('checks for duplicate username before creating', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ id: 'existing_user' }); // username check returns duplicate

      try {
        await register(VALID_REGISTRATION);
        fail('Expected AuthError to be thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).message).toBe('Username is already taken.');
      }

      // Should not attempt to create user.
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('returns DUPLICATE_USERNAME error code for duplicate username', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'existing_user' });

      try {
        await register(VALID_REGISTRATION);
        fail('Expected AuthError to be thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).code).toBe(AuthErrorCode.DUPLICATE_USERNAME);
        expect((error as AuthError).statusCode).toBe(409);
      }
    });

    it('checks for duplicate email before creating', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(null) // username check — no duplicate
        .mockResolvedValueOnce({ id: 'existing_user' }); // email check — duplicate

      await expect(register(VALID_REGISTRATION)).rejects.toThrow('Email is already registered.');
    });

    it('returns DUPLICATE_EMAIL error code for duplicate email', async () => {
      mockPrisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'existing_user' });

      try {
        await register(VALID_REGISTRATION);
        fail('Expected AuthError to be thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).code).toBe(AuthErrorCode.DUPLICATE_EMAIL);
        expect((error as AuthError).statusCode).toBe(409);
      }
    });

    it('throws validation error for missing username', async () => {
      const data = { ...VALID_REGISTRATION, username: '' };

      await expect(register(data)).rejects.toThrow(AuthError);
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('throws validation error for invalid email format', async () => {
      const data = { ...VALID_REGISTRATION, email: 'not-an-email' };

      await expect(register(data)).rejects.toThrow(AuthError);
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('throws validation error for short password', async () => {
      const data = { ...VALID_REGISTRATION, password: 'short' };

      await expect(register(data)).rejects.toThrow(AuthError);
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('throws validation error for invalid role', async () => {
      const data = { ...VALID_REGISTRATION, role: 'SUPERADMIN' };

      await expect(register(data)).rejects.toThrow(AuthError);
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('supports MERCHANT role registration', async () => {
      mockPrisma.user.create.mockResolvedValue({
        id: 'merchant_1',
        username: 'testmerchant',
        email: 'merchant@example.com',
        role: 'MERCHANT',
      });

      const result = await register({
        ...VALID_REGISTRATION,
        username: 'testmerchant',
        email: 'merchant@example.com',
        role: 'MERCHANT',
      });

      expect(result.user.role).toBe('MERCHANT');
    });
  });

  // ── login ─────────────────────────────────────────────────────────────

  describe('login()', () => {
    let validPasswordHash: string;

    beforeAll(async () => {
      validPasswordHash = await bcrypt.hash(VALID_LOGIN.password, 12);
    });

    it('returns a JWT for valid credentials', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        buildMockUser({ passwordHash: validPasswordHash }),
      );
      mockPrisma.user.update.mockResolvedValue({});

      const result = await login(VALID_LOGIN);

      expect(result.token).toBeDefined();
      const decoded = jwt.verify(result.token, TEST_JWT_SECRET) as {
        userId: string;
        role: string;
      };
      expect(decoded.userId).toBe('user_1');
      expect(decoded.role).toBe('USER');
    });

    it('returns JWT with expiry of no more than 24 hours', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        buildMockUser({ passwordHash: validPasswordHash }),
      );
      mockPrisma.user.update.mockResolvedValue({});

      const result = await login(VALID_LOGIN);

      const decoded = jwt.decode(result.token) as { iat: number; exp: number };
      const expirySeconds = decoded.exp - decoded.iat;
      expect(expirySeconds).toBeLessThanOrEqual(24 * 60 * 60);
    });

    it('resets failed login attempts on successful login', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        buildMockUser({ passwordHash: validPasswordHash, failedLoginAttempts: 3 }),
      );
      mockPrisma.user.update.mockResolvedValue({});

      await login(VALID_LOGIN);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user_1' },
        data: { failedLoginAttempts: 0, loginLockedUntil: null },
      });
    });

    it('returns user data in response', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        buildMockUser({ passwordHash: validPasswordHash }),
      );
      mockPrisma.user.update.mockResolvedValue({});

      const result = await login(VALID_LOGIN);

      expect(result.user).toEqual({
        id: 'user_1',
        username: 'testuser',
        email: 'test@example.com',
        role: 'USER',
      });
    });

    it('returns generic "invalid credentials" for non-existent email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      try {
        await login(VALID_LOGIN);
        fail('Expected AuthError');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).message).toBe('Invalid credentials.');
        expect((error as AuthError).code).toBe(AuthErrorCode.INVALID_CREDENTIALS);
        expect((error as AuthError).statusCode).toBe(401);
      }
    });

    it('returns generic "invalid credentials" for wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        buildMockUser({ passwordHash: validPasswordHash }),
      );
      mockPrisma.user.update.mockResolvedValue({});

      try {
        await login({ ...VALID_LOGIN, password: 'wrongpassword123' });
        fail('Expected AuthError');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).message).toBe('Invalid credentials.');
        // Message is generic — doesn't say "wrong password"
        expect((error as AuthError).message).not.toContain('password');
        expect((error as AuthError).message).not.toContain('email');
      }
    });

    it('returns generic "invalid credentials" for inactive account', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        buildMockUser({ passwordHash: validPasswordHash, status: 'INACTIVE' }),
      );

      try {
        await login(VALID_LOGIN);
        fail('Expected AuthError');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).message).toBe('Invalid credentials.');
        // Should not reveal the account is inactive
        expect((error as AuthError).message).not.toContain('inactive');
      }
    });

    it('throws ACCOUNT_LOCKED when account is locked', async () => {
      const futureDate = new Date(Date.now() + 10 * 60 * 1000);
      mockPrisma.user.findUnique.mockResolvedValue(
        buildMockUser({
          passwordHash: validPasswordHash,
          failedLoginAttempts: 5,
          loginLockedUntil: futureDate,
        }),
      );

      try {
        await login(VALID_LOGIN);
        fail('Expected AuthError');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).code).toBe(AuthErrorCode.ACCOUNT_LOCKED);
        expect((error as AuthError).message).toContain('temporarily locked');
      }
    });

    it('increments failed login attempts on wrong password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        buildMockUser({ passwordHash: validPasswordHash, failedLoginAttempts: 2 }),
      );
      mockPrisma.user.update.mockResolvedValue({});

      await expect(
        login({ ...VALID_LOGIN, password: 'wrongpassword' }),
      ).rejects.toThrow('Invalid credentials.');

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user_1' },
        data: { failedLoginAttempts: 3, loginLockedUntil: null },
      });
    });

    it('locks account after 5 consecutive failed login attempts', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(
        buildMockUser({
          passwordHash: validPasswordHash,
          failedLoginAttempts: 4, // This will be the 5th failure.
        }),
      );
      mockPrisma.user.update.mockResolvedValue({});

      await expect(
        login({ ...VALID_LOGIN, password: 'wrongpassword' }),
      ).rejects.toThrow('Invalid credentials.');

      const updateCall = mockPrisma.user.update.mock.calls[0][0];
      expect(updateCall.data.failedLoginAttempts).toBe(5);
      expect(updateCall.data.loginLockedUntil).toBeInstanceOf(Date);

      // Lockout should be approximately 15 minutes in the future.
      const lockUntil = updateCall.data.loginLockedUntil as Date;
      const diffMinutes = (lockUntil.getTime() - Date.now()) / (1000 * 60);
      expect(diffMinutes).toBeGreaterThan(14);
      expect(diffMinutes).toBeLessThanOrEqual(15.1);
    });

    it('resets failed counter after expired lockout and allows login', async () => {
      const pastDate = new Date(Date.now() - 1 * 60 * 1000); // 1 min ago (expired)
      mockPrisma.user.findUnique.mockResolvedValue(
        buildMockUser({
          passwordHash: validPasswordHash,
          failedLoginAttempts: 5,
          loginLockedUntil: pastDate,
        }),
      );
      mockPrisma.user.update.mockResolvedValue({});

      const result = await login(VALID_LOGIN);

      expect(result.token).toBeDefined();
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user_1' },
        data: { failedLoginAttempts: 0, loginLockedUntil: null },
      });
    });
  });

  // ── validateToken ─────────────────────────────────────────────────────

  describe('validateToken()', () => {
    it('returns userId and role for a valid token', () => {
      const token = jwt.sign(
        { userId: 'user_1', role: 'USER' },
        TEST_JWT_SECRET,
        { expiresIn: '1h' },
      );

      const result = validateToken(token);

      expect(result).toEqual({ userId: 'user_1', role: 'USER' });
    });

    it('throws for an expired token', () => {
      const token = jwt.sign(
        { userId: 'user_1', role: 'USER' },
        TEST_JWT_SECRET,
        { expiresIn: -1 }, // Already expired.
      );

      expect(() => validateToken(token)).toThrow(AuthError);
      expect(() => validateToken(token)).toThrow('Invalid token.');
    });

    it('throws for a token signed with a different secret', () => {
      const token = jwt.sign(
        { userId: 'user_1', role: 'USER' },
        'different-secret',
        { expiresIn: '1h' },
      );

      expect(() => validateToken(token)).toThrow(AuthError);
    });

    it('throws for a malformed token string', () => {
      expect(() => validateToken('not.a.valid.jwt')).toThrow(AuthError);
    });

    it('throws for a token missing userId claim', () => {
      const token = jwt.sign(
        { role: 'USER' },
        TEST_JWT_SECRET,
        { expiresIn: '1h' },
      );

      expect(() => validateToken(token)).toThrow(AuthError);
    });

    it('throws for a token missing role claim', () => {
      const token = jwt.sign(
        { userId: 'user_1' },
        TEST_JWT_SECRET,
        { expiresIn: '1h' },
      );

      expect(() => validateToken(token)).toThrow(AuthError);
    });

    it('returns INVALID_TOKEN error code', () => {
      try {
        validateToken('bad-token');
        fail('Expected AuthError');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(AuthError);
        expect((error as AuthError).code).toBe(AuthErrorCode.INVALID_TOKEN);
        expect((error as AuthError).statusCode).toBe(401);
      }
    });
  });

  // ── validateTokenWithSession ──────────────────────────────────────────

  describe('validateTokenWithSession()', () => {
    it('returns userId and role for a valid, fresh token', async () => {
      const token = jwt.sign(
        { userId: 'user_1', role: 'USER' },
        TEST_JWT_SECRET,
        { expiresIn: '1h' },
      );

      // User's updatedAt is before the token was issued.
      mockPrisma.user.findUnique.mockResolvedValue({
        updatedAt: new Date('2020-01-01T00:00:00Z'),
      });

      const result = await validateTokenWithSession(token);
      expect(result).toEqual({ userId: 'user_1', role: 'USER' });
    });

    it('rejects a token issued before the user updatedAt (session invalidation)', async () => {
      // Create a token that was issued "in the past".
      const iatInPast = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const token = jwt.sign(
        { userId: 'user_1', role: 'USER', iat: iatInPast },
        TEST_JWT_SECRET,
        { expiresIn: '24h' },
      );

      // User's updatedAt is more recent than the token's iat.
      const updatedAt = new Date(); // now
      mockPrisma.user.findUnique.mockResolvedValue({ updatedAt });

      await expect(validateTokenWithSession(token)).rejects.toThrow(AuthError);
      await expect(validateTokenWithSession(token)).rejects.toThrow('Invalid token.');
    });

    it('rejects a token if the user no longer exists', async () => {
      const token = jwt.sign(
        { userId: 'deleted_user', role: 'USER' },
        TEST_JWT_SECRET,
        { expiresIn: '1h' },
      );

      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(validateTokenWithSession(token)).rejects.toThrow(AuthError);
    });

    it('rejects an expired token', async () => {
      const token = jwt.sign(
        { userId: 'user_1', role: 'USER' },
        TEST_JWT_SECRET,
        { expiresIn: -1 },
      );

      await expect(validateTokenWithSession(token)).rejects.toThrow(AuthError);
    });
  });
});
