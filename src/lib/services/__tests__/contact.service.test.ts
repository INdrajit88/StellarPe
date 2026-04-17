/**
 * Unit tests for ContactService.
 *
 * Mocks Prisma to test contact creation (with existence validation and
 * duplicate rejection), listing (alphabetical order), update, and deletion
 * in isolation.
 *
 * @see Requirements 6.1–6.6
 */

import { jest } from '@jest/globals';

// Prisma is mocked globally via test/setup.ts
import { prisma } from '@/lib/prisma';
import {
  createContact,
  listContacts,
  updateContact,
  deleteContact,
  ContactError,
  ContactErrorCode,
} from '../contact.service';
import { buildContact } from '../../../../test/helpers/factories';

// ── Test constants ──────────────────────────────────────────────────────

const TEST_USER_ID = 'user_contact_test_1';
const TEST_CONTACT_ID = 'contact_1';
const TEST_STELLAR_ADDRESS = 'GBCM3GAOCAPT3YPZCIZ2JKXJQ7YUQFGQE5AQNXFM5LJDQH7ZZQKZVA';
const TEST_USERNAME = 'alice';
const TEST_DISPLAY_NAME = 'Alice Wonderland';

// ── Helpers ─────────────────────────────────────────────────────────────

/** Creates a Prisma-style unique constraint error object. */
function makePrismaUniqueError(targetFields: string[]) {
  const error = new Error('Unique constraint failed') as Error & {
    code: string;
    meta: { target: string[] };
  };
  error.code = 'P2002';
  error.meta = { target: targetFields };
  return error;
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('ContactService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── createContact ───────────────────────────────────────────────────

  describe('createContact()', () => {
    it('validates that the Stellar address exists before saving', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({ id: 'wallet_1' });
      (prisma.contact.create as jest.Mock).mockResolvedValue(
        buildContact({
          userId: TEST_USER_ID,
          displayName: TEST_DISPLAY_NAME,
          stellarAddress: TEST_STELLAR_ADDRESS,
        }),
      );

      await createContact(TEST_USER_ID, {
        displayName: TEST_DISPLAY_NAME,
        stellarAddress: TEST_STELLAR_ADDRESS,
      });

      expect(prisma.wallet.findUnique).toHaveBeenCalledWith({
        where: { stellarAddress: TEST_STELLAR_ADDRESS },
        select: { id: true },
      });
    });

    it('validates that the username exists before saving', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user_2' });
      (prisma.contact.create as jest.Mock).mockResolvedValue(
        buildContact({
          userId: TEST_USER_ID,
          displayName: TEST_DISPLAY_NAME,
          username: TEST_USERNAME,
        }),
      );

      await createContact(TEST_USER_ID, {
        displayName: TEST_DISPLAY_NAME,
        username: TEST_USERNAME,
      });

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { username: TEST_USERNAME },
        select: { id: true },
      });
    });

    it('rejects when Stellar address does not exist in the system', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        createContact(TEST_USER_ID, {
          displayName: TEST_DISPLAY_NAME,
          stellarAddress: TEST_STELLAR_ADDRESS,
        }),
      ).rejects.toThrow(ContactError);

      try {
        await createContact(TEST_USER_ID, {
          displayName: TEST_DISPLAY_NAME,
          stellarAddress: TEST_STELLAR_ADDRESS,
        });
      } catch (error) {
        expect((error as ContactError).code).toBe(ContactErrorCode.ADDRESS_NOT_FOUND);
        expect((error as ContactError).statusCode).toBe(404);
      }
    });

    it('rejects when username does not exist in the system', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        createContact(TEST_USER_ID, {
          displayName: TEST_DISPLAY_NAME,
          username: 'nonexistent_user',
        }),
      ).rejects.toThrow(ContactError);

      try {
        await createContact(TEST_USER_ID, {
          displayName: TEST_DISPLAY_NAME,
          username: 'nonexistent_user',
        });
      } catch (error) {
        expect((error as ContactError).code).toBe(ContactErrorCode.USERNAME_NOT_FOUND);
      }
    });

    it('creates a contact with stellarAddress when valid', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({ id: 'wallet_1' });

      const expected = buildContact({
        id: TEST_CONTACT_ID,
        userId: TEST_USER_ID,
        displayName: TEST_DISPLAY_NAME,
        stellarAddress: TEST_STELLAR_ADDRESS,
      });
      (prisma.contact.create as jest.Mock).mockResolvedValue(expected);

      const result = await createContact(TEST_USER_ID, {
        displayName: TEST_DISPLAY_NAME,
        stellarAddress: TEST_STELLAR_ADDRESS,
      });

      expect(prisma.contact.create).toHaveBeenCalledWith({
        data: {
          userId: TEST_USER_ID,
          displayName: TEST_DISPLAY_NAME,
          stellarAddress: TEST_STELLAR_ADDRESS,
          username: null,
        },
      });
      expect(result.contact).toEqual(expected);
    });

    it('creates a contact with username when valid', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user_2' });

      const expected = buildContact({
        id: TEST_CONTACT_ID,
        userId: TEST_USER_ID,
        displayName: TEST_DISPLAY_NAME,
        username: TEST_USERNAME,
        stellarAddress: null,
      });
      (prisma.contact.create as jest.Mock).mockResolvedValue(expected);

      const result = await createContact(TEST_USER_ID, {
        displayName: TEST_DISPLAY_NAME,
        username: TEST_USERNAME,
      });

      expect(prisma.contact.create).toHaveBeenCalledWith({
        data: {
          userId: TEST_USER_ID,
          displayName: TEST_DISPLAY_NAME,
          stellarAddress: null,
          username: TEST_USERNAME,
        },
      });
      expect(result.contact).toEqual(expected);
    });

    it('validates both stellarAddress and username when both are provided', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({ id: 'wallet_1' });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user_2' });
      (prisma.contact.create as jest.Mock).mockResolvedValue(
        buildContact({
          userId: TEST_USER_ID,
          displayName: TEST_DISPLAY_NAME,
          stellarAddress: TEST_STELLAR_ADDRESS,
          username: TEST_USERNAME,
        }),
      );

      await createContact(TEST_USER_ID, {
        displayName: TEST_DISPLAY_NAME,
        stellarAddress: TEST_STELLAR_ADDRESS,
        username: TEST_USERNAME,
      });

      expect(prisma.wallet.findUnique).toHaveBeenCalled();
      expect(prisma.user.findUnique).toHaveBeenCalled();
    });

    it('rejects when neither stellarAddress nor username is provided', async () => {
      await expect(
        createContact(TEST_USER_ID, { displayName: TEST_DISPLAY_NAME }),
      ).rejects.toThrow(ContactError);

      try {
        await createContact(TEST_USER_ID, { displayName: TEST_DISPLAY_NAME });
      } catch (error) {
        expect((error as ContactError).code).toBe(ContactErrorCode.VALIDATION_ERROR);
      }
    });

    it('catches duplicate stellarAddress constraint violation', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({ id: 'wallet_1' });
      (prisma.contact.create as jest.Mock).mockRejectedValue(
        makePrismaUniqueError(['stellarAddress']),
      );

      try {
        await createContact(TEST_USER_ID, {
          displayName: TEST_DISPLAY_NAME,
          stellarAddress: TEST_STELLAR_ADDRESS,
        });
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ContactError);
        expect((error as ContactError).code).toBe(ContactErrorCode.DUPLICATE_CONTACT);
        expect((error as ContactError).statusCode).toBe(409);
        expect((error as ContactError).message).toContain('Stellar address');
      }
    });

    it('catches duplicate username constraint violation', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'user_2' });
      (prisma.contact.create as jest.Mock).mockRejectedValue(
        makePrismaUniqueError(['username']),
      );

      try {
        await createContact(TEST_USER_ID, {
          displayName: TEST_DISPLAY_NAME,
          username: TEST_USERNAME,
        });
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ContactError);
        expect((error as ContactError).code).toBe(ContactErrorCode.DUPLICATE_CONTACT);
        expect((error as ContactError).message).toContain('username');
      }
    });

    it('re-throws non-unique-constraint database errors', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({ id: 'wallet_1' });
      (prisma.contact.create as jest.Mock).mockRejectedValue(
        new Error('Connection refused'),
      );

      await expect(
        createContact(TEST_USER_ID, {
          displayName: TEST_DISPLAY_NAME,
          stellarAddress: TEST_STELLAR_ADDRESS,
        }),
      ).rejects.toThrow('Connection refused');
    });
  });

  // ── listContacts ──────────────────────────────────────────────────────

  describe('listContacts()', () => {
    it('queries contacts for the given userId ordered by displayName', async () => {
      (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);

      await listContacts(TEST_USER_ID);

      expect(prisma.contact.findMany).toHaveBeenCalledWith({
        where: { userId: TEST_USER_ID },
        orderBy: { displayName: 'asc' },
      });
    });

    it('returns contacts in the order provided by the database', async () => {
      const contacts = [
        buildContact({ displayName: 'Alice', userId: TEST_USER_ID }),
        buildContact({ displayName: 'Bob', userId: TEST_USER_ID }),
        buildContact({ displayName: 'Charlie', userId: TEST_USER_ID }),
      ];
      (prisma.contact.findMany as jest.Mock).mockResolvedValue(contacts);

      const result = await listContacts(TEST_USER_ID);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual(contacts[0]);
      expect(result[1]).toEqual(contacts[1]);
      expect(result[2]).toEqual(contacts[2]);
    });

    it('returns an empty array when user has no contacts', async () => {
      (prisma.contact.findMany as jest.Mock).mockResolvedValue([]);

      const result = await listContacts(TEST_USER_ID);

      expect(result).toEqual([]);
    });
  });

  // ── updateContact ─────────────────────────────────────────────────────

  describe('updateContact()', () => {
    it('verifies the contact belongs to the user before updating', async () => {
      const existing = buildContact({ id: TEST_CONTACT_ID, userId: TEST_USER_ID });
      (prisma.contact.findFirst as jest.Mock).mockResolvedValue(existing);
      (prisma.contact.update as jest.Mock).mockResolvedValue({
        ...existing,
        displayName: 'Updated Name',
      });

      await updateContact(TEST_USER_ID, TEST_CONTACT_ID, {
        displayName: 'Updated Name',
      });

      expect(prisma.contact.findFirst).toHaveBeenCalledWith({
        where: { id: TEST_CONTACT_ID, userId: TEST_USER_ID },
      });
    });

    it('updates displayName when provided', async () => {
      const existing = buildContact({ id: TEST_CONTACT_ID, userId: TEST_USER_ID });
      (prisma.contact.findFirst as jest.Mock).mockResolvedValue(existing);
      (prisma.contact.update as jest.Mock).mockResolvedValue({
        ...existing,
        displayName: 'New Name',
      });

      const result = await updateContact(TEST_USER_ID, TEST_CONTACT_ID, {
        displayName: 'New Name',
      });

      expect(prisma.contact.update).toHaveBeenCalledWith({
        where: { id: TEST_CONTACT_ID },
        data: { displayName: 'New Name' },
      });
      expect((result.contact as Record<string, unknown>).displayName).toBe('New Name');
    });

    it('updates stellarAddress when provided', async () => {
      const existing = buildContact({ id: TEST_CONTACT_ID, userId: TEST_USER_ID });
      (prisma.contact.findFirst as jest.Mock).mockResolvedValue(existing);
      (prisma.contact.update as jest.Mock).mockResolvedValue({
        ...existing,
        stellarAddress: TEST_STELLAR_ADDRESS,
      });

      await updateContact(TEST_USER_ID, TEST_CONTACT_ID, {
        stellarAddress: TEST_STELLAR_ADDRESS,
      });

      expect(prisma.contact.update).toHaveBeenCalledWith({
        where: { id: TEST_CONTACT_ID },
        data: { stellarAddress: TEST_STELLAR_ADDRESS },
      });
    });

    it('throws CONTACT_NOT_FOUND when the contact does not exist', async () => {
      (prisma.contact.findFirst as jest.Mock).mockResolvedValue(null);

      try {
        await updateContact(TEST_USER_ID, 'nonexistent_id', {
          displayName: 'New Name',
        });
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ContactError);
        expect((error as ContactError).code).toBe(ContactErrorCode.CONTACT_NOT_FOUND);
        expect((error as ContactError).statusCode).toBe(404);
      }
    });

    it('throws CONTACT_NOT_FOUND when the contact belongs to another user', async () => {
      (prisma.contact.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        updateContact('other_user_id', TEST_CONTACT_ID, {
          displayName: 'Sneaky',
        }),
      ).rejects.toThrow(ContactError);
    });

    it('catches duplicate constraint violation during update', async () => {
      const existing = buildContact({ id: TEST_CONTACT_ID, userId: TEST_USER_ID });
      (prisma.contact.findFirst as jest.Mock).mockResolvedValue(existing);
      (prisma.contact.update as jest.Mock).mockRejectedValue(
        makePrismaUniqueError(['stellarAddress']),
      );

      try {
        await updateContact(TEST_USER_ID, TEST_CONTACT_ID, {
          stellarAddress: TEST_STELLAR_ADDRESS,
        });
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ContactError);
        expect((error as ContactError).code).toBe(ContactErrorCode.DUPLICATE_CONTACT);
      }
    });
  });

  // ── deleteContact ─────────────────────────────────────────────────────

  describe('deleteContact()', () => {
    it('verifies the contact belongs to the user before deleting', async () => {
      const existing = buildContact({ id: TEST_CONTACT_ID, userId: TEST_USER_ID });
      (prisma.contact.findFirst as jest.Mock).mockResolvedValue(existing);
      (prisma.contact.delete as jest.Mock).mockResolvedValue(existing);

      await deleteContact(TEST_USER_ID, TEST_CONTACT_ID);

      expect(prisma.contact.findFirst).toHaveBeenCalledWith({
        where: { id: TEST_CONTACT_ID, userId: TEST_USER_ID },
      });
    });

    it('deletes the contact from the database', async () => {
      const existing = buildContact({ id: TEST_CONTACT_ID, userId: TEST_USER_ID });
      (prisma.contact.findFirst as jest.Mock).mockResolvedValue(existing);
      (prisma.contact.delete as jest.Mock).mockResolvedValue(existing);

      await deleteContact(TEST_USER_ID, TEST_CONTACT_ID);

      expect(prisma.contact.delete).toHaveBeenCalledWith({
        where: { id: TEST_CONTACT_ID },
      });
    });

    it('throws CONTACT_NOT_FOUND when the contact does not exist', async () => {
      (prisma.contact.findFirst as jest.Mock).mockResolvedValue(null);

      try {
        await deleteContact(TEST_USER_ID, 'nonexistent_id');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ContactError);
        expect((error as ContactError).code).toBe(ContactErrorCode.CONTACT_NOT_FOUND);
        expect((error as ContactError).statusCode).toBe(404);
      }
    });

    it('throws CONTACT_NOT_FOUND when the contact belongs to another user', async () => {
      (prisma.contact.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        deleteContact('other_user_id', TEST_CONTACT_ID),
      ).rejects.toThrow(ContactError);
    });
  });
});
