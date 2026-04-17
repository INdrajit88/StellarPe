/**
 * ContactService — Create, list, update, and delete saved contacts.
 *
 * Contacts store a display name and either a Stellar address or a username
 * (or both), linked to the requesting user's account. Before saving a new
 * contact the service verifies that the referenced address or username actually
 * exists in the system (User/Wallet tables).
 *
 * Compound unique constraints (userId + stellarAddress) and (userId + username)
 * are enforced at the database level; Prisma unique-constraint violations are
 * caught and surfaced as descriptive errors.
 *
 * @see Requirements 6.1–6.6
 */

import { prisma } from '@/lib/prisma';

// ── Prisma error code for unique constraint violation ───────────────────
/** Prisma error code P2002 indicates a unique constraint violation.
 * We catch this specifically to provide user-friendly duplicate contact errors
 * instead of exposing raw database errors. */
const PRISMA_UNIQUE_CONSTRAINT_CODE = 'P2002';

// ── Error helpers ───────────────────────────────────────────────────────

export class ContactError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'ContactError';
  }
}

export const ContactErrorCode = {
  ADDRESS_NOT_FOUND: 'ADDRESS_NOT_FOUND',
  USERNAME_NOT_FOUND: 'USERNAME_NOT_FOUND',
  DUPLICATE_CONTACT: 'DUPLICATE_CONTACT',
  CONTACT_NOT_FOUND: 'CONTACT_NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

// ── Type for Prisma errors with a `code` property ───────────────────────

interface PrismaClientKnownRequestError extends Error {
  code: string;
  meta?: { target?: string[] };
}

function isPrismaUniqueError(error: unknown): error is PrismaClientKnownRequestError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as PrismaClientKnownRequestError).code === PRISMA_UNIQUE_CONSTRAINT_CODE
  );
}

// ── createContact ───────────────────────────────────────────────────────

/**
 * Creates a new contact for a user.
 *
 * Before saving, verifies that the provided Stellar address or username
 * actually exists in the system. If both are provided, both are validated.
 * Duplicate contacts (same userId + stellarAddress or userId + username)
 * are caught via the database unique constraint and returned as a
 * descriptive error.
 *
 * @param userId - The ID of the user creating the contact.
 * @param data   - Contact data: displayName, and stellarAddress or username (or both).
 * @returns The created contact record.
 * @throws ContactError if address/username not found or duplicate.
 *
 * @see Requirements 6.1, 6.2, 6.6
 */
export async function createContact(
  userId: string,
  data: {
    displayName: string;
    stellarAddress?: string;
    username?: string;
  },
): Promise<{ contact: Record<string, unknown> }> {
  const { displayName, stellarAddress, username } = data;

  // Validate that at least one identifier is provided
  if (!stellarAddress && !username) {
    throw new ContactError(
      'Either stellarAddress or username must be provided.',
      ContactErrorCode.VALIDATION_ERROR,
      400,
    );
  }

  // Verify Stellar address exists in the system (Wallet table)
  if (stellarAddress) {
    const wallet = await prisma.wallet.findUnique({
      where: { stellarAddress },
      select: { id: true },
    });
    if (!wallet) {
      throw new ContactError(
        `Stellar address "${stellarAddress}" not found in the system.`,
        ContactErrorCode.ADDRESS_NOT_FOUND,
        404,
      );
    }
  }

  // Verify username exists in the system (User table)
  if (username) {
    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (!user) {
      throw new ContactError(
        `Username "${username}" not found in the system.`,
        ContactErrorCode.USERNAME_NOT_FOUND,
        404,
      );
    }
  }

  // Attempt to create the contact — catch unique constraint violations
  try {
    const contact = await prisma.contact.create({
      data: {
        userId,
        displayName,
        stellarAddress: stellarAddress ?? null,
        username: username ?? null,
      },
    });

    return { contact: contact as unknown as Record<string, unknown> };
  } catch (error: unknown) {
    if (isPrismaUniqueError(error)) {
      const fields = (error as PrismaClientKnownRequestError).meta?.target ?? [];
      const duplicateField = fields.includes('stellarAddress')
        ? 'Stellar address'
        : fields.includes('username')
          ? 'username'
          : 'contact';
      throw new ContactError(
        `A contact with this ${duplicateField} already exists.`,
        ContactErrorCode.DUPLICATE_CONTACT,
        409,
      );
    }
    throw error;
  }
}

// ── listContacts ────────────────────────────────────────────────────────

/**
 * Returns all contacts for a user, ordered alphabetically by displayName.
 *
 * Uses Prisma's `orderBy: { displayName: 'asc' }` which relies on the
 * database collation for ordering. For full case-insensitive ordering a
 * raw query or custom collation would be needed; the standard ordering
 * is acceptable per the design document.
 *
 * @param userId - The ID of the user whose contacts to list.
 * @returns An array of contact records sorted by displayName.
 *
 * @see Requirements 6.3
 */
export async function listContacts(
  userId: string,
): Promise<Record<string, unknown>[]> {
  const contacts = await prisma.contact.findMany({
    where: { userId },
    orderBy: { displayName: 'asc' },
  });

  return contacts as unknown as Record<string, unknown>[];
}

// ── updateContact ───────────────────────────────────────────────────────

/**
 * Updates a contact's display name, Stellar address, or username.
 *
 * Only the owning user can update their own contacts (enforced by the
 * compound where clause on userId + contactId).
 *
 * @param userId    - The ID of the user who owns the contact.
 * @param contactId - The ID of the contact to update.
 * @param data      - Fields to update: displayName, stellarAddress, or username.
 * @returns The updated contact record.
 * @throws ContactError if the contact is not found.
 *
 * @see Requirements 6.4
 */
export async function updateContact(
  userId: string,
  contactId: string,
  data: {
    displayName?: string;
    stellarAddress?: string;
    username?: string;
  },
): Promise<{ contact: Record<string, unknown> }> {
  // Verify the contact belongs to the user
  const existing = await prisma.contact.findFirst({
    where: { id: contactId, userId },
  });

  if (!existing) {
    throw new ContactError(
      'Contact not found.',
      ContactErrorCode.CONTACT_NOT_FOUND,
      404,
    );
  }

  // Build the update payload — only include provided fields
  const updateData: Record<string, unknown> = {};
  if (data.displayName !== undefined) updateData.displayName = data.displayName;
  if (data.stellarAddress !== undefined) updateData.stellarAddress = data.stellarAddress;
  if (data.username !== undefined) updateData.username = data.username;

  try {
    const contact = await prisma.contact.update({
      where: { id: contactId },
      data: updateData,
    });

    return { contact: contact as unknown as Record<string, unknown> };
  } catch (error: unknown) {
    if (isPrismaUniqueError(error)) {
      const fields = (error as PrismaClientKnownRequestError).meta?.target ?? [];
      const duplicateField = fields.includes('stellarAddress')
        ? 'Stellar address'
        : fields.includes('username')
          ? 'username'
          : 'contact';
      throw new ContactError(
        `A contact with this ${duplicateField} already exists.`,
        ContactErrorCode.DUPLICATE_CONTACT,
        409,
      );
    }
    throw error;
  }
}

// ── deleteContact ───────────────────────────────────────────────────────

/**
 * Deletes a contact belonging to the specified user.
 *
 * @param userId    - The ID of the user who owns the contact.
 * @param contactId - The ID of the contact to delete.
 * @throws ContactError if the contact is not found.
 *
 * @see Requirements 6.5
 */
export async function deleteContact(
  userId: string,
  contactId: string,
): Promise<void> {
  // Verify the contact belongs to the user
  const existing = await prisma.contact.findFirst({
    where: { id: contactId, userId },
  });

  if (!existing) {
    throw new ContactError(
      'Contact not found.',
      ContactErrorCode.CONTACT_NOT_FOUND,
      404,
    );
  }

  await prisma.contact.delete({
    where: { id: contactId },
  });
}
