/**
 * Property-based tests for admin and account lifecycle.
 *
 * Feature: stellar-pay, Property 29: Account activation/deactivation round-trip
 * Feature: stellar-pay, Property 30: Admin-only endpoint access
 *
 * Validates: Requirements 12.4, 12.5, 12.6
 *
 * Uses fast-check to generate arbitrary inputs and verify admin/account
 * invariants across many randomized cases.
 */

import fc from 'fast-check';
import { jest } from '@jest/globals';

// Prisma is mocked globally via test/setup.ts
import { prisma } from '@/lib/prisma';
import {
  setAccountStatus,
  AdminError,
} from '@/lib/services/admin.service';
import { requireRole } from '@/lib/middleware/role-guard';

// ── Typed mocks ──────────────────────────────────────────────────────────────

const mockPrisma = prisma as unknown as {
  user: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
};

// ── Generators ───────────────────────────────────────────────────────────────

/** Generates a random userId (cuid-like). */
const userIdArb = fc
  .stringMatching(/^[a-zA-Z][a-zA-Z0-9]{5,20}$/)
  .map((s) => `user_${s}`);

/** Generates a valid account status. */
const statusArb = fc.constantFrom('ACTIVE' as const, 'INACTIVE' as const);

/** Generates a non-admin role. */
const nonAdminRoleArb = fc.constantFrom('USER', 'MERCHANT');

/** Generates any valid role. */
const anyRoleArb = fc.constantFrom('USER', 'MERCHANT', 'ADMIN');

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Admin & Account Lifecycle — Property Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Property 29: Account activation/deactivation round-trip ───────────────

  describe('Property 29: Account activation/deactivation round-trip', () => {
    // Feature: stellar-pay, Property 29: Account activation/deactivation round-trip
    it('deactivating an active account sets status to INACTIVE', async () => {
      /**
       * Validates: Requirements 12.4
       *
       * For any user ID, calling setAccountStatus with 'INACTIVE' should
       * update the user's status to INACTIVE in the database.
       */
      await fc.assert(
        fc.asyncProperty(userIdArb, async (userId) => {
          jest.clearAllMocks();

          // Mock: user exists
          mockPrisma.user.findUnique.mockResolvedValue({ id: userId });
          mockPrisma.user.update.mockResolvedValue({ id: userId, status: 'INACTIVE' });

          await setAccountStatus(userId, 'INACTIVE');

          // Verify the update was called with INACTIVE status
          expect(mockPrisma.user.update).toHaveBeenCalledWith({
            where: { id: userId },
            data: { status: 'INACTIVE' },
          });

          return true;
        }),
        { numRuns: 20 },
      );
    }, 120_000);

    // Feature: stellar-pay, Property 29: Account activation/deactivation round-trip
    it('reactivating an inactive account sets status to ACTIVE', async () => {
      /**
       * Validates: Requirements 12.5
       *
       * For any user ID, calling setAccountStatus with 'ACTIVE' should
       * update the user's status to ACTIVE in the database.
       */
      await fc.assert(
        fc.asyncProperty(userIdArb, async (userId) => {
          jest.clearAllMocks();

          // Mock: user exists
          mockPrisma.user.findUnique.mockResolvedValue({ id: userId });
          mockPrisma.user.update.mockResolvedValue({ id: userId, status: 'ACTIVE' });

          await setAccountStatus(userId, 'ACTIVE');

          // Verify the update was called with ACTIVE status
          expect(mockPrisma.user.update).toHaveBeenCalledWith({
            where: { id: userId },
            data: { status: 'ACTIVE' },
          });

          return true;
        }),
        { numRuns: 20 },
      );
    }, 120_000);

    // Feature: stellar-pay, Property 29: Account activation/deactivation round-trip
    it('round-trip: deactivate then reactivate restores ACTIVE status', async () => {
      /**
       * Validates: Requirements 12.4, 12.5
       *
       * For any user ID, deactivating and then reactivating should result
       * in the final update setting status to ACTIVE.
       */
      await fc.assert(
        fc.asyncProperty(userIdArb, async (userId) => {
          jest.clearAllMocks();

          // Mock: user exists for both calls
          mockPrisma.user.findUnique.mockResolvedValue({ id: userId });
          mockPrisma.user.update.mockResolvedValue({});

          // Deactivate
          await setAccountStatus(userId, 'INACTIVE');

          // Reactivate
          await setAccountStatus(userId, 'ACTIVE');

          // The last update call should set status to ACTIVE
          const lastCall = mockPrisma.user.update.mock.calls[
            mockPrisma.user.update.mock.calls.length - 1
          ][0];
          expect(lastCall.data.status).toBe('ACTIVE');

          return true;
        }),
        { numRuns: 20 },
      );
    }, 120_000);

    // Feature: stellar-pay, Property 29: Account activation/deactivation round-trip
    it('setAccountStatus throws AdminError for non-existent user', async () => {
      /**
       * Validates: Requirements 12.4, 12.5
       *
       * For any user ID that does not exist in the database, setAccountStatus
       * should throw an AdminError with USER_NOT_FOUND code.
       */
      await fc.assert(
        fc.asyncProperty(userIdArb, statusArb, async (userId, status) => {
          jest.clearAllMocks();

          // Mock: user does NOT exist
          mockPrisma.user.findUnique.mockResolvedValue(null);

          try {
            await setAccountStatus(userId, status);
            return false; // Should have thrown
          } catch (error: unknown) {
            expect(error).toBeInstanceOf(AdminError);
            expect((error as AdminError).statusCode).toBe(404);
          }

          // Update should NOT have been called
          expect(mockPrisma.user.update).not.toHaveBeenCalled();

          return true;
        }),
        { numRuns: 20 },
      );
    }, 120_000);
  });

  // ── Property 30: Admin-only endpoint access ───────────────────────────────

  describe('Property 30: Admin-only endpoint access', () => {
    // Feature: stellar-pay, Property 30: Admin-only endpoint access
    it('non-admin roles receive 403 from admin-only role guard', () => {
      /**
       * Validates: Requirements 12.6
       *
       * For any user with role USER or MERCHANT, the admin role guard
       * should return a 403 Forbidden response.
       */
      fc.assert(
        fc.property(nonAdminRoleArb, (role) => {
          const guard = requireRole('ADMIN');
          const result = guard(role);

          // Non-admin roles should be rejected
          expect(result).not.toBeNull();
          expect(result).toBeInstanceOf(Response);
          expect(result!.status).toBe(403);

          return true;
        }),
        { numRuns: 20 },
      );
    });

    // Feature: stellar-pay, Property 30: Admin-only endpoint access
    it('ADMIN role passes the admin-only role guard', () => {
      /**
       * Validates: Requirements 12.6
       *
       * For a user with the ADMIN role, the admin role guard should
       * return null (access granted).
       */
      const guard = requireRole('ADMIN');
      const result = guard('ADMIN');

      // Admin role should be allowed
      expect(result).toBeNull();
    });

    // Feature: stellar-pay, Property 30: Admin-only endpoint access
    it('null or undefined role receives 403 from role guard', () => {
      /**
       * Validates: Requirements 12.6
       *
       * For any null or undefined role value, the role guard should
       * return a 403 Forbidden response.
       */
      fc.assert(
        fc.property(
          fc.constantFrom(null, undefined, ''),
          (role) => {
            const guard = requireRole('ADMIN');
            const result = guard(role as string | null | undefined);

            expect(result).not.toBeNull();
            expect(result).toBeInstanceOf(Response);
            expect(result!.status).toBe(403);

            return true;
          },
        ),
        { numRuns: 3 },
      );
    });

    // Feature: stellar-pay, Property 30: Admin-only endpoint access
    it('multi-role guard allows any of the specified roles', () => {
      /**
       * Validates: Requirements 12.6
       *
       * For a guard configured with multiple roles, any of those roles
       * should be allowed, and all other roles should be rejected.
       */
      fc.assert(
        fc.property(anyRoleArb, (role) => {
          // Guard that allows USER and MERCHANT but not ADMIN
          const guard = requireRole('USER', 'MERCHANT');
          const result = guard(role);

          if (role === 'USER' || role === 'MERCHANT') {
            // Should be allowed
            expect(result).toBeNull();
          } else {
            // ADMIN should be rejected
            expect(result).not.toBeNull();
            expect(result!.status).toBe(403);
          }

          return true;
        }),
        { numRuns: 20 },
      );
    });
  });
});
