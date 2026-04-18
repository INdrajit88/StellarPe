/**
 * POST /api/users/pin/verify — Verify a user's Transaction PIN.
 *
 * Validates the submitted PIN against the stored bcrypt hash without
 * mutating the PIN itself. Used by the PIN Gate flow to confirm the
 * user's identity before granting dashboard access.
 *
 * Middleware stack:
 * 1. CSRF validation (POST is state-mutating)
 * 2. JWT auth (Edge middleware — x-user-id / x-user-role headers)
 * 3. Role guard (USER only)
 * 4. Zod validation (verifyPinSchema)
 * 5. Call PINService.verifyPin()
 * 6. Return result
 *
 * Response mapping:
 * - 200: PIN matches → { verified: true }
 * - 401: PIN mismatch → { error: "Incorrect PIN", attemptsRemaining: number }
 * - 423: Account locked → { error: "Account locked", lockedUntil: string }
 * - 400: Validation failure or invalid JSON
 * - 403: CSRF missing or role not authorized
 * - 500: Unexpected server error
 *
 * @see Requirements 14.2, 14.5, 14.6, 14.7
 */

import { verifyPin } from '@/lib/services/pin.service';
import { verifyPinSchema } from '@/lib/validators/pin.validator';
import { validateRequest } from '@/lib/middleware/validator';
import { requireRole } from '@/lib/middleware/role-guard';
import { validateCsrf } from '@/lib/middleware/csrf';
import { prisma } from '@/lib/prisma';

/** Maximum consecutive failed PIN attempts before lockout. */
const MAX_FAILED_ATTEMPTS = 5;

export async function POST(request: Request) {
  try {
    // Step 1: CSRF validation — POST is a state-mutating method.
    const csrfError = validateCsrf(request);
    if (csrfError) {
      return csrfError;
    }

    // Step 2: Extract auth context from Edge middleware headers.
    const userId = request.headers.get('x-user-id');
    const userRole = request.headers.get('x-user-role');

    // Step 3: Role guard — USER and MERCHANT can verify a PIN.
    const roleGuard = requireRole('USER', 'MERCHANT');
    const roleError = roleGuard(userRole);
    if (roleError) {
      return roleError;
    }

    // Step 4: Parse and validate the request body with Zod.
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { error: 'Invalid JSON in request body.' },
        { status: 400 },
      );
    }

    const validation = validateRequest(verifyPinSchema, body);
    if (validation.error) {
      return validation.error;
    }

    // Step 5: Delegate to PINService.verifyPin.
    const isMatch = await verifyPin(userId!, validation.data.pin);

    if (isMatch) {
      // Step 6a: PIN correct — return success.
      return Response.json(
        { verified: true },
        { status: 200 },
      );
    }

    // Step 6b: PIN incorrect — query updated failed attempts and return 401.
    const user = await prisma.user.findUnique({
      where: { id: userId! },
      select: { failedPinAttempts: true },
    });

    const attemptsRemaining = Math.max(
      0,
      MAX_FAILED_ATTEMPTS - (user?.failedPinAttempts ?? MAX_FAILED_ATTEMPTS),
    );

    return Response.json(
      { error: 'Incorrect PIN', attemptsRemaining },
      { status: 401 },
    );
  } catch (error: unknown) {
    // Handle lockout errors — verifyPin throws when account is locked.
    if (
      error instanceof Error &&
      error.message.includes('Account is temporarily locked')
    ) {
      // Query the lockout expiry time.
      const userId = request.headers.get('x-user-id');
      const user = await prisma.user.findUnique({
        where: { id: userId! },
        select: { pinLockedUntil: true },
      });

      return Response.json(
        {
          error: 'Account locked',
          lockedUntil: user?.pinLockedUntil?.toISOString() ?? null,
        },
        { status: 423 },
      );
    }

    // Handle "no PIN set" errors as 400.
    if (
      error instanceof Error &&
      error.message.includes('Transaction PIN has not been set')
    ) {
      return Response.json(
        { error: 'Transaction PIN has not been set.' },
        { status: 400 },
      );
    }

    // Handle "user not found" errors as 400.
    if (error instanceof Error && error.message.includes('User not found')) {
      return Response.json(
        { error: 'User not found.' },
        { status: 400 },
      );
    }

    // Unexpected error — do not leak internal details.
    console.error('Verify PIN error:', error);
    return Response.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 },
    );
  }
}
