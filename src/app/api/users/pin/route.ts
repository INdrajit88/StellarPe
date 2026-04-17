/**
 * POST /api/users/pin — Set a new Transaction PIN.
 * PUT /api/users/pin — Reset (change) the Transaction PIN.
 *
 * Requires JWT authentication (handled by Edge middleware which sets
 * x-user-id and x-user-role headers). Accessible only by the USER role.
 *
 * Both endpoints require CSRF validation (state-mutating methods).
 *
 * Middleware stack (POST — set PIN):
 * 1. JWT auth (Edge middleware — x-user-id / x-user-role headers)
 * 2. CSRF validation (POST is state-mutating)
 * 3. Role guard (USER only)
 * 4. Zod validation (setPinSchema)
 *
 * Middleware stack (PUT — reset PIN):
 * 1. JWT auth (Edge middleware — x-user-id / x-user-role headers)
 * 2. CSRF validation (PUT is state-mutating)
 * 3. Role guard (USER only)
 * 4. Zod validation (resetPinSchema)
 *
 * Error mapping:
 * - 400: Validation failure, invalid JSON, or invalid PIN format
 * - 403: CSRF missing or role not authorized
 * - 500: Unexpected server error
 *
 * @see Requirements 4.1 (set 4-6 digit PIN), 4.6 (PIN reset),
 *      4.7 (invalidate sessions on PIN change), 13.7 (CSRF)
 */

import { setPin, resetPin } from '@/lib/services/pin.service';
import { setPinSchema, resetPinSchema } from '@/lib/validators/pin.validator';
import { validateRequest } from '@/lib/middleware/validator';
import { requireRole } from '@/lib/middleware/role-guard';
import { validateCsrf } from '@/lib/middleware/csrf';

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

    // Step 3: Role guard — only USER can set a PIN.
    const roleGuard = requireRole('USER');
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

    const validation = validateRequest(setPinSchema, body);
    if (validation.error) {
      return validation.error;
    }

    // Step 5: Delegate to PINService.setPin.
    await setPin(userId!, validation.data.pin);

    // Step 6: Return success response.
    return Response.json(
      { message: 'Transaction PIN set successfully.' },
      { status: 200 },
    );
  } catch (error: unknown) {
    // Handle PIN format errors as 400.
    if (error instanceof Error && error.message.includes('PIN must be')) {
      return Response.json(
        { error: error.message },
        { status: 400 },
      );
    }

    // Unexpected error — do not leak internal details.
    console.error('Set PIN error:', error);
    return Response.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    // Step 1: CSRF validation — PUT is a state-mutating method.
    const csrfError = validateCsrf(request);
    if (csrfError) {
      return csrfError;
    }

    // Step 2: Extract auth context from Edge middleware headers.
    const userId = request.headers.get('x-user-id');
    const userRole = request.headers.get('x-user-role');

    // Step 3: Role guard — only USER can reset a PIN.
    const roleGuard = requireRole('USER');
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

    const validation = validateRequest(resetPinSchema, body);
    if (validation.error) {
      return validation.error;
    }

    // Step 5: Delegate to PINService.resetPin.
    await resetPin(userId!, validation.data.newPin);

    // Step 6: Return success response.
    // Note: Per Requirement 4.7, resetPin invalidates all sessions by
    // bumping updatedAt. The client should re-authenticate after this.
    return Response.json(
      { message: 'Transaction PIN reset successfully. Please re-authenticate.' },
      { status: 200 },
    );
  } catch (error: unknown) {
    // Handle PIN format errors as 400.
    if (error instanceof Error && error.message.includes('PIN must be')) {
      return Response.json(
        { error: error.message },
        { status: 400 },
      );
    }

    // Unexpected error — do not leak internal details.
    console.error('Reset PIN error:', error);
    return Response.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 },
    );
  }
}
