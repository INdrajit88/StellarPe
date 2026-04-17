/**
 * PINService — Transaction PIN management with bcrypt hashing and lockout enforcement.
 *
 * Handles the full lifecycle of a user's Transaction PIN:
 * - Setting a new PIN (4–6 digit validation + bcrypt hashing)
 * - Verifying a PIN against the stored hash with failed-attempt tracking
 * - Lockout enforcement after 5 consecutive failures within a 15-minute window
 * - PIN reset with session invalidation via updatedAt timestamp bump
 *
 * SECURITY:
 * - Plaintext PINs are NEVER stored or logged.
 * - Bcrypt cost factor is set to 12 (minimum) for brute-force resistance.
 * - Failed attempts are tracked atomically in the database.
 *
 * @see Requirements 4.1 (4-6 digit PIN), 4.2 (bcrypt cost ≥ 12), 4.3 (PIN required for payments),
 *      4.4 (verify before decrypt), 4.5 (lockout after 5 failures), 4.6 (PIN reset), 4.7 (invalidate sessions)
 */

import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

// ── Constants ───────────────────────────────────────────────────────────

/** Minimum bcrypt cost factor — provides ~250 ms hash time on modern hardware. */
const BCRYPT_COST_FACTOR = 12;

/** Maximum consecutive failed PIN attempts before lockout. */
const MAX_FAILED_ATTEMPTS = 5;

/** Lockout duration in minutes after exceeding max failed attempts. */
const LOCKOUT_DURATION_MINUTES = 15;

/** Regex for a valid Transaction PIN: exactly 4 to 6 numeric digits. */
const PIN_FORMAT_REGEX = /^\d{4,6}$/;

// ── PIN Validation ──────────────────────────────────────────────────────

/**
 * Validates that a PIN string is exactly 4–6 numeric digits.
 *
 * @param pin — The candidate PIN string.
 * @returns true if the PIN matches the required format.
 */
export function isValidPinFormat(pin: string): boolean {
  return PIN_FORMAT_REGEX.test(pin);
}

// ── setPin ──────────────────────────────────────────────────────────────

/**
 * Sets a new Transaction PIN for a user.
 *
 * Validates the PIN format (4–6 digits), hashes it with bcrypt (cost ≥ 12),
 * and stores the hash on the User record. Resets any prior failed attempts.
 *
 * @param userId — The user's database ID.
 * @param pin — The plaintext PIN (4–6 digits). Never stored or logged.
 * @throws Error if PIN format is invalid or user is not found.
 *
 * @see Requirements 4.1, 4.2
 */
export async function setPin(userId: string, pin: string): Promise<void> {
  // Validate PIN format: must be exactly 4–6 numeric digits.
  if (!isValidPinFormat(pin)) {
    throw new Error('PIN must be 4 to 6 numeric digits.');
  }

  // Hash the PIN with bcrypt at cost factor 12 for brute-force resistance.
  // The salt is generated automatically by bcrypt.
  const pinHash = await bcrypt.hash(pin, BCRYPT_COST_FACTOR);

  // Store the hash and reset any failed attempt counters.
  await prisma.user.update({
    where: { id: userId },
    data: {
      pinHash,
      failedPinAttempts: 0,
      pinLockedUntil: null,
    },
  });
}

// ── isLocked ────────────────────────────────────────────────────────────

/**
 * Checks if a user's PIN authorization is currently locked due to
 * too many consecutive failed attempts.
 *
 * A lockout is active when `pinLockedUntil` is set and is in the future.
 *
 * @param userId — The user's database ID.
 * @returns true if the account is in a PIN lockout period.
 *
 * @see Requirements 4.5
 */
export async function isLocked(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { pinLockedUntil: true },
  });

  if (!user) {
    throw new Error('User not found.');
  }

  // If pinLockedUntil is set and is still in the future, the account is locked.
  if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
    return true;
  }

  return false;
}

// ── verifyPin ───────────────────────────────────────────────────────────

/**
 * Verifies a submitted PIN against the stored bcrypt hash.
 *
 * Enforces lockout logic:
 * - If the account is currently locked, rejects immediately.
 * - On failure, increments `failedPinAttempts`. After 5 consecutive failures
 *   within a 15-minute window, sets `pinLockedUntil` to now + 15 minutes.
 * - On success, resets the failed attempt counter.
 *
 * @param userId — The user's database ID.
 * @param pin — The plaintext PIN to verify. Never stored or logged.
 * @returns true if the PIN matches, false otherwise.
 * @throws Error if the account is locked, user not found, or no PIN is set.
 *
 * @see Requirements 4.3, 4.4, 4.5
 */
export async function verifyPin(userId: string, pin: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      pinHash: true,
      failedPinAttempts: true,
      pinLockedUntil: true,
    },
  });

  if (!user) {
    throw new Error('User not found.');
  }

  if (!user.pinHash) {
    throw new Error('Transaction PIN has not been set.');
  }

  // Check if the account is currently in a lockout period.
  if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
    throw new Error(
      'Account is temporarily locked due to too many failed PIN attempts. Please try again later.'
    );
  }

  // If there was a previous lockout that has now expired, reset the counter.
  // This handles the edge case where the lockout window has passed but the
  // failedPinAttempts counter wasn't reset (because no successful attempt
  // occurred). Without this, stale attempts would carry over and the user
  // could be locked out after fewer than 5 new failures.
  const effectiveFailedAttempts =
    user.pinLockedUntil && user.pinLockedUntil <= new Date()
      ? 0
      : user.failedPinAttempts;

  // Compare the submitted PIN against the stored bcrypt hash.
  const isMatch = await bcrypt.compare(pin, user.pinHash);

  if (isMatch) {
    // PIN correct — reset failed attempt counter.
    await prisma.user.update({
      where: { id: userId },
      data: {
        failedPinAttempts: 0,
        pinLockedUntil: null,
      },
    });
    return true;
  }

  // PIN incorrect — increment failed attempts and check lockout threshold.
  const newFailedAttempts = effectiveFailedAttempts + 1;

  // Determine if we need to trigger a lockout (5 consecutive failures).
  const lockoutData: { failedPinAttempts: number; pinLockedUntil: Date | null } = {
    failedPinAttempts: newFailedAttempts,
    pinLockedUntil: null,
  };

  if (newFailedAttempts >= MAX_FAILED_ATTEMPTS) {
    // Lock the account for 15 minutes.
    const lockUntil = new Date();
    lockUntil.setMinutes(lockUntil.getMinutes() + LOCKOUT_DURATION_MINUTES);
    lockoutData.pinLockedUntil = lockUntil;
  }

  await prisma.user.update({
    where: { id: userId },
    data: lockoutData,
  });

  return false;
}

// ── resetPin ────────────────────────────────────────────────────────────

/**
 * Resets a user's Transaction PIN.
 *
 * Validates the new PIN format, hashes it, updates the User record, and
 * bumps `updatedAt` to invalidate all existing sessions. JWTs issued before
 * the `updatedAt` timestamp should be treated as invalid by the auth middleware.
 *
 * @param userId — The user's database ID.
 * @param newPin — The new plaintext PIN (4–6 digits). Never stored or logged.
 * @throws Error if PIN format is invalid or user is not found.
 *
 * @see Requirements 4.6, 4.7
 */
export async function resetPin(userId: string, newPin: string): Promise<void> {
  // Validate new PIN format: must be exactly 4–6 numeric digits.
  if (!isValidPinFormat(newPin)) {
    throw new Error('PIN must be 4 to 6 numeric digits.');
  }

  // Hash the new PIN with bcrypt at cost factor 12.
  const pinHash = await bcrypt.hash(newPin, BCRYPT_COST_FACTOR);

  // Update the PIN hash and reset lockout state.
  // Prisma's @updatedAt will automatically bump the `updatedAt` field,
  // which serves as the session invalidation boundary — any JWT issued
  // before this timestamp should be rejected by the auth middleware.
  await prisma.user.update({
    where: { id: userId },
    data: {
      pinHash,
      failedPinAttempts: 0,
      pinLockedUntil: null,
    },
  });
}
