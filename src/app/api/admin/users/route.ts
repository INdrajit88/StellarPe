/**
 * GET /api/admin/users — Paginated user management list.
 *
 * Requires JWT authentication (handled by Edge middleware which sets
 * x-user-id and x-user-role headers). Accessible only by the ADMIN role.
 *
 * Accepts optional query parameters:
 * - `page` (number, 1-indexed): Page number for pagination. Defaults to 1.
 * - `search` (string): Optional search string to filter by username or email.
 *
 * Middleware stack:
 * 1. JWT auth (Edge middleware — x-user-id / x-user-role headers)
 * 2. Role guard (ADMIN only)
 *
 * Returns a paginated list of users with pagination metadata.
 *
 * Error mapping:
 * - 400: Invalid query parameters
 * - 403: Role not authorized (non-Admin)
 * - 500: Unexpected server error
 *
 * @see Requirements 12.2 (paginated user list), 12.3 (search by username/email),
 *      12.6 (admin-only access)
 */

import { listUsers } from '@/lib/services/admin.service';
import { requireRole } from '@/lib/middleware/role-guard';

export async function GET(request: Request) {
  try {
    // Step 1: Extract auth context from Edge middleware headers.
    const userRole = request.headers.get('x-user-role');

    // Step 2: Role guard — only ADMIN can access user management.
    const roleGuard = requireRole('ADMIN');
    const roleError = roleGuard(userRole);
    if (roleError) {
      return roleError;
    }

    // Step 3: Extract query parameters for pagination and search.
    const { searchParams } = new URL(request.url);
    const pageParam = searchParams.get('page');
    const search = searchParams.get('search') ?? undefined;

    // Parse and validate page number.
    let page = 1;
    if (pageParam !== null) {
      const parsed = Number(pageParam);
      if (!Number.isInteger(parsed) || parsed < 1) {
        return Response.json(
          { error: 'Query parameter "page" must be a positive integer.' },
          { status: 400 },
        );
      }
      page = parsed;
    }

    // Step 4: Delegate to AdminService.listUsers.
    const result = await listUsers(page, search);

    // Step 5: Return paginated user list.
    return Response.json(result, { status: 200 });
  } catch (error: unknown) {
    // Unexpected error — do not leak internal details.
    console.error('Admin users list error:', error);
    return Response.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 },
    );
  }
}
