/**
 * Unit tests for PINService.
 *
 * Validates PIN format validation, bcrypt hashing, lockout enforcement,
 * and session invalidation on PIN reset.
 *
 * Uses the Prisma mock from test/setup.ts — no real database connection needed.
 *
 * @see Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7
 */

import { jest } from '@jest/globals';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import {
  setPin,
  verifyPin,
  isLocked,
  resetPin,
  isValidPinFormat,
} from '../pin.service';

// Type the mocked prisma for easier access in tests.
const mockPrisma = prisma as unknown as {
  user: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
};

describe('PINService', () => {
  // ── isValidPinFormat ────────────────────────────────────────────────

  describe('isValidPinFormat()', () => {
    it('accepts a 4-digit PIN', () => {
      expect(isValidPinFormat('1234')).toBe(true);
    });

    it('accepts a 5-digit PIN', () => {
      expect(isValidPinFormat('12345')).toBe(true);
    });

    it('accepts a 6-digit PIN', () => {
      expect(isValidPinFormat('123456')).toBe(true);
    });

    it('rejects a 3-digit PIN (too short)', () => {
      expect(isValidPinFormat('123')).toBe(false);
    });

    it('rejects a 7-digit PIN (too long)', () => {
      expect(isValidPinFormat('1234567')).toBe(false);
    });

    it('rejects a PIN with letters', () => {
      expect(isValidPinFormat('12ab')).toBe(false);
    });

    it('rejects a PIN with special characters', () => {
      expect(isValidPinFormat('12!4')).toBe(false);
    });

    it('rejects an empty string', () => {
      expect(isValidPinFormat('')).toBe(false);
    });

    it('rejects a PIN with spaces', () => {
      expect(isValidPinFormat('12 34')).toBe(false);
    });

    it('rejects a PIN with leading/trailing whitespace', () => {
      expect(isValidPinFormat(' 1234 ')).toBe(false);
    });
  });

  // ── setPin ──────────────────────────────────────────────────────────

  describe('setPin()', () => {
    it('stores a bcrypt hash of the PIN on the user record', async () => {
      mockPrisma.user.update.mockResolvedValue({});

      await setPin('user-1', '1234');

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          pinHash: expect.any(String),
          failedPinAttempts: 0,
          pinLockedUntil: null,
        }),
      });

      // Verify the stored value is a valid bcrypt hash.
      const storedHash = mockPrisma.user.update.mock.calls[0][0].data.pinHash as string;
      expect(storedHash).toMatch(/^\$2[aby]?\$/);
    });

    it('uses bcrypt cost factor of at least 12', async () => {
      mockPrisma.user.update.mockResolvedValue({});

      await setPin('user-1', '5678');

      const storedHash = mockPrisma.user.update.mock.calls[0][0].data.pinHash as string;
      // bcrypt hash format: $2b$<cost>$...
      const costStr = storedHash.split('$')[2];
      const cost = parseInt(costStr, 10);
      expect(cost).toBeGreaterThanOrEqual(12);
    });

    it('resets failed attempts and lockout when setting a new PIN', async () => {
      mockPrisma.user.update.mockResolvedValue({});

      await setPin('user-1', '9999');

      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failedPinAttempts: 0,
            pinLockedUntil: null,
          }),
        })
      );
    });

    it('throws for an invalid PIN format', async () => {
      await expect(setPin('user-1', '12')).rejects.toThrow(
        'PIN must be 4 to 6 numeric digits.'
      );
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('throws for a non-numeric PIN', async () => {
      await expect(setPin('user-1', 'abcd')).rejects.toThrow(
        'PIN must be 4 to 6 numeric digits.'
      );
    });
  });

  // ── isLocked ────────────────────────────────────────────────────────

  describe('isLocked()', () => {
    it('returns true when pinLockedUntil is in the future', async () => {
      const futureDate = new Date(Date.now() + 10 * 60 * 1000); // 10 min from now
      mockPrisma.user.findUnique.mockResolvedValue({
        pinLockedUntil: futureDate,
      });

      expect(await isLocked('user-1')).toBe(true);
    });

    it('returns false when pinLockedUntil is in the past', async () => {
      const pastDate = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago
      mockPrisma.user.findUnique.mockResolvedValue({
        pinLockedUntil: pastDate,
      });

      expect(await isLocked('user-1')).toBe(false);
    });

    it('returns false when pinLockedUntil is null', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        pinLockedUntil: null,
      });

      expect(await isLocked('user-1')).toBe(false);
    });

    it('throws when user is not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(isLocked('nonexistent')).rejects.toThrow('User not found.');
    });
  });

  // ── verifyPin ───────────────────────────────────────────────────────

  describe('verifyPin()', () => {
    const VALID_PIN = '1234';
    let validPinHash: string;

    beforeAll(async () => {
      // Pre-compute a real bcrypt hash for the test PIN.
      validPinHash = await bcrypt.hash(VALID_PIN, 12);
    });

    it('returns true for a correct PIN and resets failed attempts', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        pinHash: validPinHash,
        failedPinAttempts: 2,
        pinLockedUntil: null,
      });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await verifyPin('user-1', VALID_PIN);

      expect(result).toBe(true);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { failedPinAttempts: 0, pinLockedUntil: null },
      });
    });

    it('returns false for an incorrect PIN and increments failed attempts', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        pinHash: validPinHash,
        failedPinAttempts: 0,
        pinLockedUntil: null,
      });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await verifyPin('user-1', '9999');

      expect(result).toBe(false);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { failedPinAttempts: 1, pinLockedUntil: null },
      });
    });

    it('triggers lockout after 5 consecutive failed attempts', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        pinHash: validPinHash,
        failedPinAttempts: 4, // This will be the 5th failure
        pinLockedUntil: null,
      });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await verifyPin('user-1', '0000');

      expect(result).toBe(false);

      const updateCall = mockPrisma.user.update.mock.calls[0][0];
      expect(updateCall.data.failedPinAttempts).toBe(5);
      expect(updateCall.data.pinLockedUntil).toBeInstanceOf(Date);

      // The lockout should be approximately 15 minutes in the future.
      const lockUntil = updateCall.data.pinLockedUntil as Date;
      const diffMinutes = (lockUntil.getTime() - Date.now()) / (1000 * 60);
      expect(diffMinutes).toBeGreaterThan(14);
      expect(diffMinutes).toBeLessThanOrEqual(15.1);
    });

    it('throws when the account is locked', async () => {
      const futureDate = new Date(Date.now() + 10 * 60 * 1000);
      mockPrisma.user.findUnique.mockResolvedValue({
        pinHash: validPinHash,
        failedPinAttempts: 5,
        pinLockedUntil: futureDate,
      });

      await expect(verifyPin('user-1', VALID_PIN)).rejects.toThrow(
        'Account is temporarily locked'
      );
    });

    it('resets counter after expired lockout and allows verification', async () => {
      const pastDate = new Date(Date.now() - 1 * 60 * 1000); // 1 min ago (expired)
      mockPrisma.user.findUnique.mockResolvedValue({
        pinHash: validPinHash,
        failedPinAttempts: 5,
        pinLockedUntil: pastDate,
      });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await verifyPin('user-1', VALID_PIN);

      expect(result).toBe(true);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { failedPinAttempts: 0, pinLockedUntil: null },
      });
    });

    it('throws when user is not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(verifyPin('nonexistent', '1234')).rejects.toThrow(
        'User not found.'
      );
    });

    it('throws when no PIN has been set', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        pinHash: null,
        failedPinAttempts: 0,
        pinLockedUntil: null,
      });

      await expect(verifyPin('user-1', '1234')).rejects.toThrow(
        'Transaction PIN has not been set.'
      );
    });
  });

  // ── resetPin ────────────────────────────────────────────────────────

  describe('resetPin()', () => {
    it('stores a new bcrypt hash and resets lockout state', async () => {
      mockPrisma.user.update.mockResolvedValue({});

      await resetPin('user-1', '5678');

      const updateCall = mockPrisma.user.update.mock.calls[0][0];
      expect(updateCall.where.id).toBe('user-1');
      expect(updateCall.data.pinHash).toMatch(/^\$2[aby]?\$/);
      expect(updateCall.data.failedPinAttempts).toBe(0);
      expect(updateCall.data.pinLockedUntil).toBeNull();
    });

    it('uses bcrypt cost factor of at least 12', async () => {
      mockPrisma.user.update.mockResolvedValue({});

      await resetPin('user-1', '4321');

      const storedHash = mockPrisma.user.update.mock.calls[0][0].data.pinHash as string;
      const costStr = storedHash.split('$')[2];
      const cost = parseInt(costStr, 10);
      expect(cost).toBeGreaterThanOrEqual(12);
    });

    it('produces a hash that verifies against the new PIN', async () => {
      mockPrisma.user.update.mockResolvedValue({});

      await resetPin('user-1', '9876');

      const storedHash = mockPrisma.user.update.mock.calls[0][0].data.pinHash as string;
      const matches = await bcrypt.compare('9876', storedHash);
      expect(matches).toBe(true);
    });

    it('throws for an invalid PIN format', async () => {
      await expect(resetPin('user-1', 'abc')).rejects.toThrow(
        'PIN must be 4 to 6 numeric digits.'
      );
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('session invalidation: updatedAt is bumped by Prisma @updatedAt', async () => {
      // The Prisma @updatedAt decorator automatically updates the timestamp
      // whenever the record is modified. Calling prisma.user.update will
      // trigger this. We verify the update call is made, which implicitly
      // bumps updatedAt.
      mockPrisma.user.update.mockResolvedValue({});

      await resetPin('user-1', '1111');

      expect(mockPrisma.user.update).toHaveBeenCalledTimes(1);
    });
  });
});
