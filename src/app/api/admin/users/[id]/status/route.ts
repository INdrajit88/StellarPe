/**
 * PUT /api/admin/users/[id]/status — Activate or deactivate a user account.
 *
 * Requires JWT authentication (handled by Edge middleware which sets
 * x-user-id and x-user-role headers). Accessible only by the ADMIN role.
 * Requires CSRF validation (PUT is a state-mutating method).
 *
 * Middleware stack:
 * 1. JWT auth (Edge middleware — x-user-id / x-user-role headers)
 * 2. CSRF validation (PUT is state-mutating)
 * 3. Role guard (ADMIN only)
 * 4. Zod validation (accountStatusUpdateSchema)
 *
 * Error mapping:
 * - 400: Validation failure (invalid status value)
 * - 403: CSRF missing or role not authorized
 * - 404: User not found
 * - 500: Unexpected server error
 *
 * @see Requirements 12.4 (deactivate account), 12.5 (reactivate account),
 *      12.6 (admin-only access), 13.7 (CSRF protection)
 */

import { setAccountStatus, AdminError } from '@/lib/services/admin.service';
import { accountStatusUpdateSchema } from '@/lib/validators/admin.validator';
import { validateRequest } from '@/lib/middleware/validator';
import { requireRole } from '@/lib/middleware/role-guard';
import { validateCsrf } from '@/lib/middleware/csrf';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // Step 1: CSRF validation — PUT is a state-mutating method.
    const csrfError = validateCsrf(request);
    if (csrfError) {
      return csrfError;
    }

    // Step 2: Extract auth context from Edge middleware headers.
    const userRole = request.headers.get('x-user-role');

    // Step 3: Role guard — only ADMIN can change account status.
    const roleGuard = requireRole('ADMIN');
    const roleError = roleGuard(userRole);
    if (roleError) {
      return roleError;
    }

    // Step 4: Extract user ID from dynamic route params.
    const { id: targetUserId } = await params;

    // Step 5: Parse and validate the request body with Zod.
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { error: 'Invalid JSON in request body.' },
        { status: 400 },
      );
    }

    const validation = validateRequest(accountStatusUpdateSchema, body);
    if (validation.error) {
      return validation.error;
    }

    // Step 6: Delegate to AdminService.setAccountStatus.
    await setAccountStatus(targetUserId, validation.data.status);

    // Step 7: Return success response.
    return Response.json(
      { message: `Account status updated to "${validation.data.status}".` },
      { status: 200 },
    );
  } catch (error: unknown) {
    // Handle known AdminError instances with their status codes.
    if (error instanceof AdminError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.statusCode },
      );
    }

    // Unexpected error — do not leak internal details.
    console.error('Admin set account status error:', error);
    return Response.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 },
    );
  }
}
