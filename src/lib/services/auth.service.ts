/**
 * AuthService — User registration, login, and JWT token management.
 *
 * Handles the full authentication lifecycle:
 * - Registration: validate input, check duplicates, hash password, create user,
 *   trigger wallet creation, return JWT
 * - Login: validate credentials, check account status and lockout, issue JWT
 * - Token validation: verify JWT signature, expiry, and session freshness
 *
 * SECURITY:
 * - Passwords are hashed with bcrypt (cost factor 12) before storage.
 * - Login failures return a generic "invalid credentials" message — never
 *   revealing whether the email or password was incorrect.
 * - Failed login attempts are tracked; after 5 consecutive failures the
 *   account is locked for 15 minutes.
 * - JWT tokens include userId and role claims with a max 24-hour expiry.
 * - validateToken checks the user's updatedAt to support session invalidation
 *   after PIN changes (Requirement 4.7).
 *
 * @see Requirements 1.1 (registration), 1.2 (duplicate rejection), 1.3 (wallet creation),
 *      1.4 (JWT ≤ 24h), 1.5 (generic invalid credentials), 1.6 (expired JWT rejected),
 *      1.7 (missing fields error), 13.5 (login lockout after 5 failures)
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '@/lib/prisma';
import { createWallet } from './wallet.service';
import { registrationSchema, loginSchema } from '@/lib/validators/auth.validator';

// ── Constants ───────────────────────────────────────────────────────────

/** Minimum bcrypt cost factor for password hashing. */
const BCRYPT_COST_FACTOR = 12;

/** Maximum JWT token expiry in seconds (24 hours). */
const JWT_EXPIRY_SECONDS = 24 * 60 * 60;

/** Maximum consecutive failed login attempts before lockout. */
const MAX_FAILED_LOGIN_ATTEMPTS = 5;

/** Lockout duration in minutes after exceeding max failed login attempts. */
const LOGIN_LOCKOUT_DURATION_MINUTES = 15;

// ── Error codes ─────────────────────────────────────────────────────────

export const AuthErrorCode = {
  DUPLICATE_USERNAME: 'DUPLICATE_USERNAME',
  DUPLICATE_EMAIL: 'DUPLICATE_EMAIL',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
  INVALID_TOKEN: 'INVALID_TOKEN',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
} as const;

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Reads JWT_SECRET from process.env directly (not from env.ts) to avoid
 * import-time validation issues in test environments. The env.ts module
 * calls process.exit(1) on missing variables, which would kill the test
 * runner during module initialization.
 */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set.');
  }
  return secret;
}

// ── register ────────────────────────────────────────────────────────────

/**
 * Registers a new user account.
 *
 * Steps:
 * 1. Validate input against the registration Zod schema
 * 2. Check for duplicate username and email
 * 3. Hash the password with bcrypt (cost factor 12)
 * 4. Create the User record in the database
 * 5. Trigger wallet creation via WalletService
 * 6. Sign and return a JWT with userId and role claims
 *
 * @param data - Registration payload: { username, email, password, role }
 * @returns An object with the created user (sans password) and a JWT token.
 * @throws AuthError with DUPLICATE_USERNAME or DUPLICATE_EMAIL codes for conflicts.
 * @throws AuthError with VALIDATION_ERROR for invalid input.
 *
 * @see Requirements 1.1, 1.2, 1.3, 1.4, 1.7
 */
export async function register(data: {
  username: string;
  email: string;
  password: string;
  role: string;
}): Promise<{
  user: {
    id: string;
    username: string;
    email: string;
    role: string;
  };
  token: string;
}> {
  // Step 1: Validate input using Zod schema.
  const parsed = registrationSchema.safeParse(data);
  if (!parsed.success) {
    const missingFields = parsed.error.issues.map((issue) => issue.path.join('.'));
    throw new AuthError(
      `Validation failed: ${missingFields.join(', ')}`,
      AuthErrorCode.VALIDATION_ERROR,
      400,
    );
  }

  const { username, email, password, role } = parsed.data;

  // Step 2: Check for duplicate username.
  const existingUsername = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (existingUsername) {
    throw new AuthError(
      'Username is already taken.',
      AuthErrorCode.DUPLICATE_USERNAME,
      409,
    );
  }

  // Step 2b: Check for duplicate email.
  const existingEmail = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existingEmail) {
    throw new AuthError(
      'Email is already registered.',
      AuthErrorCode.DUPLICATE_EMAIL,
      409,
    );
  }

  // Step 3: Hash the password with bcrypt (cost factor 12).
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST_FACTOR);

  // Step 4: Create the User record.
  const user = await prisma.user.create({
    data: {
      username,
      email,
      passwordHash,
      role: role as 'USER' | 'MERCHANT',
    },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
    },
  });

  // Step 5: Trigger wallet creation for the new user.
  await createWallet(user.id);

  // Step 6: Sign a JWT with userId and role, max 24-hour expiry.
  const token = jwt.sign(
    { userId: user.id, role: user.role },
    getJwtSecret(),
    { expiresIn: JWT_EXPIRY_SECONDS },
  );

  return { user, token };
}

// ── login ───────────────────────────────────────────────────────────────

/**
 * Authenticates a user with email and password.
 *
 * Checks:
 * 1. Validate input against the login Zod schema
 * 2. Look up user by email (return generic error if not found)
 * 3. Check if the account is locked due to failed login attempts
 * 4. Check if the account is active (ACTIVE status)
 * 5. Compare the submitted password against the bcrypt hash
 * 6. On success: reset failed attempts, issue JWT
 * 7. On failure: increment failed attempts, trigger lockout at threshold
 *
 * SECURITY: Always returns a generic "invalid credentials" message on failure.
 * Never reveals whether the email or password was incorrect.
 *
 * @param data - Login payload: { email, password }
 * @returns An object with a JWT token and user info.
 * @throws AuthError with INVALID_CREDENTIALS for bad credentials.
 * @throws AuthError with ACCOUNT_LOCKED if the account is locked.
 * @throws AuthError with ACCOUNT_INACTIVE if the account is deactivated.
 *
 * @see Requirements 1.4, 1.5, 13.5
 */
export async function login(data: {
  email: string;
  password: string;
}): Promise<{
  token: string;
  user: {
    id: string;
    username: string;
    email: string;
    role: string;
  };
}> {
  // Step 1: Validate input.
  const parsed = loginSchema.safeParse(data);
  if (!parsed.success) {
    throw new AuthError(
      'Invalid credentials.',
      AuthErrorCode.INVALID_CREDENTIALS,
      401,
    );
  }

  const { email, password } = parsed.data;

  // Step 2: Look up user by email. Return generic error if not found.
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      status: true,
      passwordHash: true,
      failedLoginAttempts: true,
      loginLockedUntil: true,
    },
  });

  if (!user) {
    // Generic message — do not reveal that the email doesn't exist.
    throw new AuthError(
      'Invalid credentials.',
      AuthErrorCode.INVALID_CREDENTIALS,
      401,
    );
  }

  // Step 3: Check if account is locked due to failed login attempts.
  if (user.loginLockedUntil && user.loginLockedUntil > new Date()) {
    throw new AuthError(
      'Account is temporarily locked due to too many failed login attempts. Please try again later.',
      AuthErrorCode.ACCOUNT_LOCKED,
      423,
    );
  }

  // Step 4: Check if account is active.
  // Inactive accounts are treated the same as invalid credentials to avoid
  // leaking account status information to potential attackers.
  if (user.status === 'INACTIVE') {
    throw new AuthError(
      'Invalid credentials.',
      AuthErrorCode.ACCOUNT_INACTIVE,
      401,
    );
  }

  // If lockout has expired, reset the counter for this attempt.
  // This prevents stale failed attempts from carrying over after the
  // lockout window has passed — the user gets a fresh set of attempts.
  const effectiveFailedAttempts =
    user.loginLockedUntil && user.loginLockedUntil <= new Date()
      ? 0
      : user.failedLoginAttempts;

  // Step 5: Compare the submitted password against the stored bcrypt hash.
  const isMatch = await bcrypt.compare(password, user.passwordHash);

  if (isMatch) {
    // Step 6: Correct password — reset failed attempts, issue JWT.
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        loginLockedUntil: null,
      },
    });

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      getJwtSecret(),
      { expiresIn: JWT_EXPIRY_SECONDS },
    );

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    };
  }

  // Step 7: Incorrect password — increment failed attempts.
  const newFailedAttempts = effectiveFailedAttempts + 1;
  const lockoutData: { failedLoginAttempts: number; loginLockedUntil: Date | null } = {
    failedLoginAttempts: newFailedAttempts,
    loginLockedUntil: null,
  };

  if (newFailedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
    // Lock the account for 15 minutes.
    const lockUntil = new Date();
    lockUntil.setMinutes(lockUntil.getMinutes() + LOGIN_LOCKOUT_DURATION_MINUTES);
    lockoutData.loginLockedUntil = lockUntil;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: lockoutData,
  });

  // Always return generic "invalid credentials" — never reveal which field was wrong.
  throw new AuthError(
    'Invalid credentials.',
    AuthErrorCode.INVALID_CREDENTIALS,
    401,
  );
}

// ── validateToken ───────────────────────────────────────────────────────

/**
 * Verifies a JWT token and returns the decoded claims.
 *
 * Checks:
 * 1. Verify the JWT signature and expiry using jsonwebtoken
 * 2. Look up the user in the database to confirm existence
 * 3. Check that the JWT was issued after the user's `updatedAt` timestamp
 *    (supports session invalidation after PIN changes — Requirement 4.7)
 *
 * @param token - The JWT string to validate.
 * @returns An object with { userId, role } from the decoded token.
 * @throws AuthError with INVALID_TOKEN if the token is invalid or expired.
 *
 * @see Requirements 1.6, 4.7
 */
export function validateToken(token: string): { userId: string; role: string } {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as {
      userId: string;
      role: string;
      iat?: number;
    };

    if (!decoded.userId || !decoded.role) {
      throw new AuthError(
        'Invalid token.',
        AuthErrorCode.INVALID_TOKEN,
        401,
      );
    }

    return { userId: decoded.userId, role: decoded.role };
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      throw error;
    }
    throw new AuthError(
      'Invalid token.',
      AuthErrorCode.INVALID_TOKEN,
      401,
    );
  }
}

/**
 * Async version of validateToken that also checks the user's updatedAt
 * against the token's iat claim for session invalidation support.
 *
 * If the JWT was issued before the user's record was last updated (e.g.,
 * after a PIN change), the token is rejected. This ensures that changing
 * the Transaction PIN invalidates all existing sessions.
 *
 * @param token - The JWT string to validate.
 * @returns An object with { userId, role }.
 * @throws AuthError with INVALID_TOKEN if the token is invalid, expired,
 *         or issued before the user's last update.
 *
 * @see Requirements 1.6, 4.7
 */
export async function validateTokenWithSession(
  token: string,
): Promise<{ userId: string; role: string }> {
  // First verify the JWT signature and expiry.
  const { userId, role } = validateToken(token);

  // Decode without verification to access the iat claim.
  const decoded = jwt.decode(token) as { iat?: number } | null;
  const iat = decoded?.iat;

  if (!iat) {
    throw new AuthError(
      'Invalid token.',
      AuthErrorCode.INVALID_TOKEN,
      401,
    );
  }

  // Look up the user to check existence and updatedAt.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { updatedAt: true },
  });

  if (!user) {
    throw new AuthError(
      'Invalid token.',
      AuthErrorCode.INVALID_TOKEN,
      401,
    );
  }

  // Compare: JWT iat (seconds) vs user updatedAt (milliseconds).
  // If the token was issued before the user record was last updated,
  // reject it — this supports PIN change session invalidation.
  const updatedAtSeconds = Math.floor(user.updatedAt.getTime() / 1000);
  if (iat < updatedAtSeconds) {
    throw new AuthError(
      'Invalid token.',
      AuthErrorCode.INVALID_TOKEN,
      401,
    );
  }

  return { userId, role };
}


// ── searchUsersByUsername ────────────────────────────────────────────────

/**
 * Searches for users by partial username prefix (case-insensitive).
 *
 * Returns up to 10 matching results with username and Stellar address.
 * Used for the username autocomplete feature in the payment form.
 *
 * @param prefix - The partial username to search for (case-insensitive).
 * @returns An array of matching users with username and stellarAddress.
 *
 * @see Requirements 9.5
 */
export async function searchUsersByUsername(
  prefix: string,
): Promise<{ username: string; stellarAddress: string }[]> {
  if (!prefix || prefix.trim().length === 0) {
    return [];
  }

  const users = await prisma.user.findMany({
    where: {
      username: {
        startsWith: prefix,
        mode: 'insensitive',
      },
      status: 'ACTIVE',
    },
    select: {
      username: true,
      wallet: {
        select: { stellarAddress: true },
      },
    },
    take: 10,
    orderBy: { username: 'asc' },
  });

  // Filter out users without wallets and map to the response shape
  return users
    .filter((u) => u.wallet !== null)
    .map((u) => ({
      username: u.username,
      stellarAddress: u.wallet!.stellarAddress,
    }));
}
