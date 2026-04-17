/**
 * Property-based tests for ContactService.
 *
 * Feature: stellar-pay, Property 19: Contact creation validates existence and stores correctly
 * Feature: stellar-pay, Property 20: Contacts are returned in alphabetical order
 * Feature: stellar-pay, Property 21: Duplicate contacts are rejected
 *
 * Validates: Requirements 6.1, 6.2, 6.3, 6.6
 *
 * Uses fast-check to generate arbitrary inputs and verify contact invariants
 * across many randomized cases.
 */

import fc from 'fast-check';
import { jest } from '@jest/globals';

// Prisma is mocked globally via test/setup.ts
import { prisma } from '@/lib/prisma';
import {
  createContact,
  listContacts,
  ContactError,
  ContactErrorCode,
} from '@/lib/services/contact.service';

// ── Typed mocks ──────────────────────────────────────────────────────────────

const mockPrisma = prisma as unknown as {
  user: {
    findUnique: jest.Mock;
  };
  wallet: {
    findUnique: jest.Mock;
  };
  contact: {
    create: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
  };
};

// ── Generators ───────────────────────────────────────────────────────────────

/** Generates a random username: 3-20 alphanumeric + underscore characters. */
const usernameArb = fc
  .stringMatching(/^[a-zA-Z][a-zA-Z0-9_]{2,19}$/)
  .filter((s) => s.length >= 3 && s.length <= 20);

/** Generates a random display name: 1-30 printable characters. */
const displayNameArb = fc
  .stringMatching(/^[a-zA-Z][a-zA-Z0-9 _-]{0,29}$/)
  .filter((s) => s.trim().length >= 1);

/** Generates a random userId (cuid-like). */
const userIdArb = fc
  .stringMatching(/^[a-zA-Z][a-zA-Z0-9]{5,20}$/)
  .map((s) => `user_${s}`);

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ContactService — Property Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Property 19: Contact creation validates existence and stores correctly ─

  describe('Property 19: Contact creation validates existence and stores correctly', () => {
    // Feature: stellar-pay, Property 19: Contact creation validates existence and stores correctly
    it('creates a contact when the username exists in the system', async () => {
      /**
       * Validates: Requirements 6.1, 6.2
       *
       * For any random username, if user.findUnique returns a found user,
       * createContact should store the contact and return it successfully.
       */
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          displayNameArb,
          usernameArb,
          async (userId, displayName, username) => {
            jest.clearAllMocks();

            // Mock: username exists in the system
            mockPrisma.user.findUnique.mockResolvedValue({ id: 'found_user_id' });

            // Mock: contact creation succeeds
            const createdContact = {
              id: 'contact_new',
              userId,
              displayName,
              stellarAddress: null,
              username,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            mockPrisma.contact.create.mockResolvedValue(createdContact);

            const result = await createContact(userId, { displayName, username });

            // Verify the username was checked for existence
            expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
              where: { username },
              select: { id: true },
            });

            // Verify the contact was created with the correct data
            expect(mockPrisma.contact.create).toHaveBeenCalledTimes(1);
            expect(mockPrisma.contact.create).toHaveBeenCalledWith({
              data: {
                userId,
                displayName,
                stellarAddress: null,
                username,
              },
            });

            // Verify the result includes the created contact
            expect(result.contact).toEqual(createdContact);

            return true;
          },
        ),
        { numRuns: 20 },
      );
    }, 120_000);

    // Feature: stellar-pay, Property 19: Contact creation validates existence and stores correctly
    it('rejects contact creation when the username does not exist', async () => {
      /**
       * Validates: Requirements 6.1, 6.2
       *
       * For any random username, if user.findUnique returns null (not found),
       * createContact should throw a ContactError with USERNAME_NOT_FOUND code.
       */
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          displayNameArb,
          usernameArb,
          async (userId, displayName, username) => {
            jest.clearAllMocks();

            // Mock: username does NOT exist in the system
            mockPrisma.user.findUnique.mockResolvedValue(null);

            try {
              await createContact(userId, { displayName, username });
              // Should not reach here
              return false;
            } catch (error: unknown) {
              expect(error).toBeInstanceOf(ContactError);
              expect((error as ContactError).code).toBe(
                ContactErrorCode.USERNAME_NOT_FOUND,
              );

              // Contact should NOT have been created
              expect(mockPrisma.contact.create).not.toHaveBeenCalled();
            }

            return true;
          },
        ),
        { numRuns: 20 },
      );
    }, 120_000);
  });

  // ── Property 20: Contacts are returned in alphabetical order ──────────────

  describe('Property 20: Contacts are returned in alphabetical order', () => {
    // Feature: stellar-pay, Property 20: Contacts are returned in alphabetical order
    it('returns contacts sorted alphabetically by displayName via Prisma orderBy', async () => {
      /**
       * Validates: Requirements 6.3
       *
       * For any array of random display names, mock prisma.contact.findMany
       * to return them sorted, and verify listContacts returns them in that
       * same order. Also verify the Prisma orderBy clause is correct.
       */
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          fc.array(displayNameArb, { minLength: 1, maxLength: 20 }),
          async (userId, displayNames) => {
            jest.clearAllMocks();

            // Sort alphabetically (case-insensitive) to simulate DB ordering
            const sortedNames = [...displayNames].sort((a, b) =>
              a.localeCompare(b, undefined, { sensitivity: 'base' }),
            );

            // Build contact objects in sorted order (as the DB would return them)
            const sortedContacts = sortedNames.map((name, idx) => ({
              id: `contact_${idx}`,
              userId,
              displayName: name,
              stellarAddress: null,
              username: `user_${idx}`,
              createdAt: new Date(),
              updatedAt: new Date(),
            }));

            mockPrisma.contact.findMany.mockResolvedValue(sortedContacts);

            const result = await listContacts(userId);

            // Verify the Prisma query uses the correct orderBy clause
            expect(mockPrisma.contact.findMany).toHaveBeenCalledWith({
              where: { userId },
              orderBy: { displayName: 'asc' },
            });

            // Verify result matches the sorted order from the database
            expect(result).toHaveLength(sortedContacts.length);
            for (let i = 0; i < result.length; i++) {
              expect((result[i] as Record<string, unknown>).displayName).toBe(
                sortedNames[i],
              );
            }

            return true;
          },
        ),
        { numRuns: 20 },
      );
    }, 120_000);
  });

  // ── Property 21: Duplicate contacts are rejected ──────────────────────────

  describe('Property 21: Duplicate contacts are rejected', () => {
    // Feature: stellar-pay, Property 21: Duplicate contacts are rejected
    it('rejects duplicate contacts with DUPLICATE_CONTACT error when Prisma throws P2002', async () => {
      /**
       * Validates: Requirements 6.6
       *
       * For any contact data, if prisma.contact.create throws a P2002
       * unique constraint error, createContact should throw a ContactError
       * with DUPLICATE_CONTACT code and the contact count should remain
       * unchanged (i.e., create was not successful).
       */
      await fc.assert(
        fc.asyncProperty(
          userIdArb,
          displayNameArb,
          usernameArb,
          async (userId, displayName, username) => {
            jest.clearAllMocks();

            // Mock: username exists (validation passes)
            mockPrisma.user.findUnique.mockResolvedValue({ id: 'found_user_id' });

            // Mock: Prisma throws a P2002 unique constraint error
            const prismaError = new Error('Unique constraint failed') as Error & {
              code: string;
              meta: { target: string[] };
            };
            prismaError.code = 'P2002';
            prismaError.meta = { target: ['username'] };
            mockPrisma.contact.create.mockRejectedValue(prismaError);

            try {
              await createContact(userId, { displayName, username });
              // Should not succeed
              return false;
            } catch (error: unknown) {
              expect(error).toBeInstanceOf(ContactError);
              const contactError = error as ContactError;

              // Must have DUPLICATE_CONTACT error code
              expect(contactError.code).toBe(ContactErrorCode.DUPLICATE_CONTACT);

              // Must have 409 status code
              expect(contactError.statusCode).toBe(409);

              // Message should indicate the duplicate
              expect(contactError.message.toLowerCase()).toContain('already exists');
            }

            return true;
          },
        ),
        { numRuns: 20 },
      );
    }, 120_000);
  });
});
