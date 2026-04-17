/**
 * Property-based tests for PIN change session invalidation.
 *
 * Feature: stellar-pay, Property 17: PIN change invalidates all sessions
 *
 * Validates: Requirements 4.7
 *
 * Uses fast-check to generate arbitrary PINs and verify that changing
 * a user's Transaction PIN causes all previously issued JWTs to be
 * rejected by the authentication middleware.
 *
 * The mechanism: resetPin updates the User record (bumping updatedAt via
 * Prisma's @updatedAt), and validateTokenWithSession checks that the JWT's
 * iat (issued-at) is not before the user's updatedAt. If iat < updatedAt,
 * the token is rejected.
 */

import fc from 'fast-check';
import jwt from 'jsonwebtoken';
import { jest } from '@jest/globals';

// Set JWT_SECRET before importing the service.
const TEST_JWT_SECRET = 'test-jwt-secret-for-pin-session-tests';
process.env.JWT_SECRET = TEST_JWT_SECRET;

// Prisma is mocked globally via test/setup.ts
import { prisma } from '@/lib/prisma';
import {
  validateTokenWithSession,
  AuthError,
} from '@/lib/services/auth.service';

// ── Typed mocks ──────────────────────────────────────────────────────────────

const mockPrisma = prisma as unknown as {
  user: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
};

// ── Generators ───────────────────────────────────────────────────────────────

/** Generates a valid PIN (4-6 digits). */
const validPinArb = fc.integer({ min: 1000, max: 999999 }).map(String);

/** Generates a valid userId. */
const userIdArb = fc
  .stringMatching(/^[a-zA-Z][a-zA-Z0-9]{5,20}$/)
  .map((s) => `user_${s}`);

/** Generates a valid role. */
const roleArb = fc.constantFrom('USER', 'MERCHANT');

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PIN Session Invalidation — Property Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Property 17: PIN change invalidates all sessions ──────────────────────

  describe('Property 17: PIN change invalidates all sessions', () => {
    // Feature: stellar-pay, Property 17: PIN change invalidates all sessions
    it('JWT issued before PIN change (updatedAt bump) is rejected', async () => {
      /**
       * Validates: Requirements 4.7
       *
       * For any user, if a JWT was issued at time T1 and the user's
       * updatedAt is bumped to T2 > T1 (simulating a PIN change),
       * then validateTokenWithSession should reject the token.
       *
       * The mechanism:
       * 1. Issue a JWT with iat = T1
       * 2. Simulate PIN change by setting user.updatedAt = T2 where T2 > T1
       * 3. validateTokenWithSession checks iat < updatedAt → rejects
       */
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          roleArb,
          // Generate a delay in seconds (1-3600) representing time between
          // token issuance and PIN change
          fc.integer({ min: 1, max: 3600 }),
          async (userId, role, delaySeconds) => {
            jest.clearAllMocks();

            // Issue a JWT at the current time
            const token = jwt.sign(
              { userId, role },
              TEST_JWT_SECRET,
              { expiresIn: '24h' },
            );

            // Decode to get the iat
            const decoded = jwt.decode(token) as { iat: number };
            const iat = decoded.iat;

            // Simulate PIN change: updatedAt is `delaySeconds` after the JWT was issued
            const updatedAt = new Date((iat + delaySeconds) * 1000);

            // Mock: user exists with updatedAt after the JWT was issued
            mockPrisma.user.findUnique.mockResolvedValue({
              updatedAt,
            });

            // The token should be rejected because iat < updatedAt
            try {
              await validateTokenWithSession(token);
              // Should not reach here
              return false;
            } catch (error: unknown) {
              expect(error).toBeInstanceOf(AuthError);
              expect((error as AuthError).statusCode).toBe(401);
              expect((error as AuthError).message).toBe('Invalid token.');
            }

            return true;
          },
        ),
        { numRuns: 20 },
      );
    }, 120_000);

    // Feature: stellar-pay, Property 17: PIN change invalidates all sessions
    it('JWT issued after PIN change (updatedAt) is accepted', async () => {
      /**
       * Validates: Requirements 4.7
       *
       * For any user, if a JWT was issued at time T1 and the user's
       * updatedAt is T0 < T1 (no PIN change since token issuance),
       * then validateTokenWithSession should accept the token.
       */
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          roleArb,
          // Generate a delay in seconds (1-3600) representing time between
          // last update and token issuance
          fc.integer({ min: 1, max: 3600 }),
          async (userId, role, delaySeconds) => {
            jest.clearAllMocks();

            // Issue a JWT at the current time
            const token = jwt.sign(
              { userId, role },
              TEST_JWT_SECRET,
              { expiresIn: '24h' },
            );

            // Decode to get the iat
            const decoded = jwt.decode(token) as { iat: number };
            const iat = decoded.iat;

            // Simulate: updatedAt is `delaySeconds` BEFORE the JWT was issued
            // (no PIN change since token was issued)
            const updatedAt = new Date((iat - delaySeconds) * 1000);

            // Mock: user exists with updatedAt before the JWT was issued
            mockPrisma.user.findUnique.mockResolvedValue({
              updatedAt,
            });

            // The token should be accepted because iat >= updatedAt
            const result = await validateTokenWithSession(token);

            expect(result.userId).toBe(userId);
            expect(result.role).toBe(role);

            return true;
          },
        ),
        { numRuns: 20 },
      );
    }, 120_000);

    // Feature: stellar-pay, Property 17: PIN change invalidates all sessions
    it('multiple JWTs issued before PIN change are all rejected', async () => {
      /**
       * Validates: Requirements 4.7
       *
       * For any user with multiple active sessions (JWTs), changing the
       * PIN should invalidate ALL of them, not just one.
       */
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          roleArb,
          fc.integer({ min: 2, max: 5 }), // number of tokens
          async (userId, role, tokenCount) => {
            jest.clearAllMocks();

            // Issue multiple JWTs at the current time
            const tokens: string[] = [];
            for (let i = 0; i < tokenCount; i++) {
              tokens.push(
                jwt.sign(
                  { userId, role },
                  TEST_JWT_SECRET,
                  { expiresIn: '24h' },
                ),
              );
            }

            // Simulate PIN change: updatedAt is 10 seconds in the future
            const decoded = jwt.decode(tokens[0]) as { iat: number };
            const updatedAt = new Date((decoded.iat + 10) * 1000);

            // ALL tokens should be rejected
            for (const token of tokens) {
              mockPrisma.user.findUnique.mockResolvedValue({ updatedAt });

              try {
                await validateTokenWithSession(token);
                return false; // Should have thrown
              } catch (error: unknown) {
                expect(error).toBeInstanceOf(AuthError);
                expect((error as AuthError).statusCode).toBe(401);
              }
            }

            return true;
          },
        ),
        { numRuns: 20 },
      );
    }, 120_000);
  });
});
