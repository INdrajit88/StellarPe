/**
 * Property-based tests for AuthService and JWT middleware.
 *
 * Feature: stellar-pay, Property 1: Registration creates user with linked wallet
 * Feature: stellar-pay, Property 2: Duplicate registration fields are rejected
 * Feature: stellar-pay, Property 3: JWT expiry is bounded
 * Feature: stellar-pay, Property 4: Invalid credentials produce generic 401
 * Feature: stellar-pay, Property 5: Expired or absent JWT rejects with 401
 * Feature: stellar-pay, Property 6: Missing registration fields listed in error
 *
 * Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
 *
 * Uses fast-check to generate arbitrary inputs and verify auth invariants
 * across many randomized cases.
 */

import fc from 'fast-check';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { jest } from '@jest/globals';

// ── Mock setup ──────────────────────────────────────────────────────────

// Mock WalletService.createWallet to avoid Stellar/Friendbot calls.
const mockCreateWallet = jest.fn<(userId: string) => Promise<{ publicKey: string }>>();

jest.mock('../../src/lib/services/wallet.service', () => ({
  __esModule: true,
  createWallet: (...args: unknown[]) => mockCreateWallet(...(args as [string])),
}));

// Set JWT_SECRET before importing the service.
const TEST_JWT_SECRET = 'test-jwt-secret-for-auth-property-tests';
process.env.JWT_SECRET = TEST_JWT_SECRET;

import {
  register,
  login,
  validateToken,
  AuthError,
} from '@/lib/services/auth.service';
import { prisma } from '@/lib/prisma';

// ── Type helpers ────────────────────────────────────────────────────────

const mockPrisma = prisma as unknown as {
  user: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
};

// ── Generators ──────────────────────────────────────────────────────────

/** Generates a valid username: 3-30 alphanumeric + underscore characters. */
const validUsername = fc
  .stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{2,29}$/)
  .filter((s) => s.length >= 3 && s.length <= 30);

/** Generates a valid email address. */
const validEmail = fc
  .tuple(
    fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{1,10}$/),
    fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9]{1,5}$/),
    fc.constantFrom('com', 'org', 'net', 'io'),
  )
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

/** Generates a valid password (8+ characters). */
const validPassword = fc.string({ minLength: 8, maxLength: 30 }).filter((s) => s.length >= 8);

/** Generates a valid role. */
const validRole = fc.constantFrom('USER', 'MERCHANT');

/** Generates a full valid registration payload. */
const validRegistrationData = fc.record({
  username: validUsername,
  email: validEmail,
  password: validPassword,
  role: validRole,
});

// ── Tests ───────────────────────────────────────────────────────────────

describe('AuthService — Property Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateWallet.mockResolvedValue({ publicKey: `G${'A'.repeat(55)}` });
  });

  // ── Property 1: Registration creates user with linked wallet ────────

  describe('Property 1: Registration creates user with linked wallet', () => {
    // Feature: stellar-pay, Property 1: Registration creates user with linked wallet
    it('creates a user record and triggers wallet creation for any valid registration data', async () => {
      /**
       * Validates: Requirements 1.1, 1.3
       *
       * For any valid registration payload (unique username, valid email,
       * password ≥ 8 chars, role of USER or MERCHANT), register() should
       * create a User record and trigger wallet creation via createWallet.
       */
      await fc.assert(
        fc.asyncProperty(validRegistrationData, async (data) => {
          // No duplicates found.
          mockPrisma.user.findUnique.mockResolvedValue(null);

          const userId = `user_${data.username}`;
          mockPrisma.user.create.mockResolvedValue({
            id: userId,
            username: data.username,
            email: data.email,
            role: data.role,
          });

          const result = await register(data);

          // User record was created.
          expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);

          // Wallet creation was triggered with the new user's ID.
          expect(mockCreateWallet).toHaveBeenCalledWith(userId);

          // Return includes user info and a JWT token.
          expect(result.user.id).toBe(userId);
          expect(result.user.username).toBe(data.username);
          expect(result.user.email).toBe(data.email);
          expect(result.user.role).toBe(data.role);
          expect(typeof result.token).toBe('string');
          expect(result.token.length).toBeGreaterThan(0);

          jest.clearAllMocks();
          mockCreateWallet.mockResolvedValue({ publicKey: `G${'A'.repeat(55)}` });

          return true;
        }),
        { numRuns: 20 },
      );
    }, 120_000);
  });

  // ── Property 2: Duplicate registration fields are rejected ──────────

  describe('Property 2: Duplicate registration fields are rejected', () => {
    // Feature: stellar-pay, Property 2: Duplicate registration fields are rejected
    it('rejects registration with a duplicate username', async () => {
      /**
       * Validates: Requirements 1.2
       *
       * For any valid registration data, if a user with the same username
       * already exists, register() should throw an AuthError and no new
       * user record should be created.
       */
      await fc.assert(
        fc.asyncProperty(validRegistrationData, async (data) => {
          // Username already exists.
          mockPrisma.user.findUnique.mockResolvedValueOnce({ id: 'existing_user' });

          try {
            await register(data);
            return false; // Should have thrown.
          } catch (error: unknown) {
            expect(error).toBeInstanceOf(AuthError);
            expect((error as AuthError).message.toLowerCase()).toContain('username');
          }

          // No user should be created.
          expect(mockPrisma.user.create).not.toHaveBeenCalled();

          jest.clearAllMocks();
          mockCreateWallet.mockResolvedValue({ publicKey: `G${'A'.repeat(55)}` });
          return true;
        }),
        { numRuns: 20 },
      );
    }, 120_000);

    // Feature: stellar-pay, Property 2: Duplicate registration fields are rejected
    it('rejects registration with a duplicate email', async () => {
      /**
       * Validates: Requirements 1.2
       *
       * For any valid registration data, if a user with the same email
       * already exists, register() should throw an AuthError and no new
       * user record should be created.
       */
      await fc.assert(
        fc.asyncProperty(validRegistrationData, async (data) => {
          // Username check passes, email check finds duplicate.
          mockPrisma.user.findUnique
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ id: 'existing_user' });

          try {
            await register(data);
            return false; // Should have thrown.
          } catch (error: unknown) {
            expect(error).toBeInstanceOf(AuthError);
            expect((error as AuthError).message.toLowerCase()).toContain('email');
          }

          expect(mockPrisma.user.create).not.toHaveBeenCalled();

          jest.clearAllMocks();
          mockCreateWallet.mockResolvedValue({ publicKey: `G${'A'.repeat(55)}` });
          return true;
        }),
        { numRuns: 20 },
      );
    }, 120_000);
  });

  // ── Property 3: JWT expiry is bounded ───────────────────────────────

  describe('Property 3: JWT expiry is bounded', () => {
    // Feature: stellar-pay, Property 3: JWT expiry is bounded
    it('login returns a JWT with exp - iat <= 24 hours', async () => {
      /**
       * Validates: Requirements 1.4
       *
       * For any valid login, the returned JWT should have an expiry (exp)
       * of no more than 24 hours from the issuance time (iat).
       */
      const correctPassword = 'correctpassword123';
      const passwordHash = await bcrypt.hash(correctPassword, 4); // Low cost for speed

      await fc.assert(
        fc.asyncProperty(validEmail, async (email) => {
          mockPrisma.user.findUnique.mockResolvedValue({
            id: 'user_1',
            username: 'testuser',
            email,
            role: 'USER',
            status: 'ACTIVE',
            passwordHash,
            failedLoginAttempts: 0,
            loginLockedUntil: null,
          });
          mockPrisma.user.update.mockResolvedValue({});

          const result = await login({ email, password: correctPassword });

          const decoded = jwt.decode(result.token) as { iat: number; exp: number };
          const expirySeconds = decoded.exp - decoded.iat;

          // Expiry must be positive and no more than 24 hours.
          expect(expirySeconds).toBeGreaterThan(0);
          expect(expirySeconds).toBeLessThanOrEqual(24 * 60 * 60);

          jest.clearAllMocks();
          return true;
        }),
        { numRuns: 20 },
      );
    }, 120_000);
  });

  // ── Property 4: Invalid credentials produce generic 401 ────────────

  describe('Property 4: Invalid credentials produce generic 401', () => {
    // Feature: stellar-pay, Property 4: Invalid credentials produce generic 401
    it('returns generic "Invalid credentials" for any wrong password without revealing which field is wrong', async () => {
      /**
       * Validates: Requirements 1.5
       *
       * For any random wrong password, login should return a generic
       * "Invalid credentials" message that does not reveal whether
       * the email or the password was incorrect.
       */
      const correctPassword = 'the_correct_password_123';
      const passwordHash = await bcrypt.hash(correctPassword, 4);

      await fc.assert(
        fc.asyncProperty(
          validPassword.filter((p) => p !== correctPassword),
          async (wrongPassword) => {
            mockPrisma.user.findUnique.mockResolvedValue({
              id: 'user_1',
              username: 'testuser',
              email: 'test@example.com',
              role: 'USER',
              status: 'ACTIVE',
              passwordHash,
              failedLoginAttempts: 0,
              loginLockedUntil: null,
            });
            mockPrisma.user.update.mockResolvedValue({});

            try {
              await login({ email: 'test@example.com', password: wrongPassword });
              // Should not reach here.
              return false;
            } catch (error: unknown) {
              expect(error).toBeInstanceOf(AuthError);
              const authError = error as AuthError;

              // Message should be generic.
              expect(authError.message).toBe('Invalid credentials.');
              expect(authError.statusCode).toBe(401);

              // Must NOT reveal which field is wrong.
              const lowerMsg = authError.message.toLowerCase();
              expect(lowerMsg).not.toContain('password');
              expect(lowerMsg).not.toContain('email');
              expect(lowerMsg).not.toContain('wrong');
              expect(lowerMsg).not.toContain('incorrect');
            }

            jest.clearAllMocks();
            return true;
          },
        ),
        { numRuns: 20 },
      );
    }, 120_000);
  });

  // ── Property 5: Expired or absent JWT rejects with 401 ─────────────

  describe('Property 5: Expired or absent JWT rejects with 401', () => {
    // Feature: stellar-pay, Property 5: Expired or absent JWT rejects with 401
    it('rejects any expired JWT token', () => {
      /**
       * Validates: Requirements 1.6
       *
       * For any expired JWT string, validateToken should throw an
       * AuthError with statusCode 401.
       */
      fc.assert(
        fc.property(
          fc.record({
            userId: fc.stringMatching(/^[a-zA-Z0-9_]{3,20}$/),
            role: fc.constantFrom('USER', 'MERCHANT', 'ADMIN'),
          }),
          ({ userId, role }) => {
            // Create an already-expired token.
            const expiredToken = jwt.sign(
              { userId, role },
              TEST_JWT_SECRET,
              { expiresIn: -1 },
            );

            try {
              validateToken(expiredToken);
              return false; // Should have thrown.
            } catch (error: unknown) {
              expect(error).toBeInstanceOf(AuthError);
              expect((error as AuthError).statusCode).toBe(401);
              return true;
            }
          },
        ),
        { numRuns: 20 },
      );
    });

    // Feature: stellar-pay, Property 5: Expired or absent JWT rejects with 401
    it('rejects empty or absent JWT strings', () => {
      /**
       * Validates: Requirements 1.6
       *
       * For any empty string or random non-JWT string, validateToken
       * should throw an AuthError with statusCode 401.
       */
      fc.assert(
        fc.property(
          fc.constantFrom('', ' ', 'not-a-jwt', 'abc.def', 'a.b.c.d'),
          (invalidToken) => {
            try {
              validateToken(invalidToken);
              return false; // Should have thrown.
            } catch (error: unknown) {
              expect(error).toBeInstanceOf(AuthError);
              expect((error as AuthError).statusCode).toBe(401);
              return true;
            }
          },
        ),
        { numRuns: 20 },
      );
    });
  });

  // ── Property 6: Missing registration fields listed in error ─────────

  describe('Property 6: Missing registration fields listed in error', () => {
    // Feature: stellar-pay, Property 6: Missing registration fields listed in error
    it('lists missing or invalid fields in the error when required fields are omitted', async () => {
      /**
       * Validates: Requirements 1.7
       *
       * For any subset of required registration fields that is omitted or
       * empty, register() should throw an AuthError whose message lists
       * the missing field names.
       */
      const requiredFields = ['username', 'email', 'password', 'role'] as const;

      // Generate a non-empty subset of fields to omit.
      const fieldSubsetArb = fc
        .subarray(requiredFields as unknown as string[], { minLength: 1, maxLength: 4 })
        .filter((arr) => arr.length > 0);

      await fc.assert(
        fc.asyncProperty(fieldSubsetArb, async (fieldsToOmit) => {
          // Start with valid data, then blank out omitted fields.
          const data: Record<string, string> = {
            username: 'validuser',
            email: 'valid@example.com',
            password: 'securepassword123',
            role: 'USER',
          };

          for (const field of fieldsToOmit) {
            data[field] = '';
          }

          try {
            await register(data as { username: string; email: string; password: string; role: string });
            // Should not succeed.
            return false;
          } catch (error: unknown) {
            expect(error).toBeInstanceOf(AuthError);
            const authError = error as AuthError;

            // The error message should reference each omitted/invalid field.
            for (const field of fieldsToOmit) {
              expect(authError.message.toLowerCase()).toContain(field.toLowerCase());
            }
            return true;
          }
        }),
        { numRuns: 20 },
      );
    }, 120_000);
  });
});
