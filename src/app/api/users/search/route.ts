/**
 * GET /api/users/search — Username autocomplete search.
 *
 * Accepts a query parameter 'q' with a partial username prefix and returns
 * up to 10 matching users with their usernames and Stellar addresses.
 *
 * Requires JWT authentication (handled by Edge middleware which sets
 * x-user-id and x-user-role headers). Accessible only by the USER role.
 *
 * Middleware stack:
 * 1. JWT auth (Edge middleware — x-user-id / x-user-role headers)
 * 2. Role guard (USER only)
 *
 * Error mapping:
 * - 400: Missing or empty 'q' query parameter
 * - 403: Role not authorized
 * - 500: Unexpected server error
 *
 * @see Requirements 9.5 (username autocomplete, up to 10 results)
 */

import { searchUsersByUsername } from '@/lib/services/auth.service';
import { requireRole } from '@/lib/middleware/role-guard';

export async function GET(request: Request) {
  try {
    // Step 1: Extract auth context from Edge middleware headers.
    const userRole = request.headers.get('x-user-role');

    // Step 2: Role guard — only USER can search for usernames.
    const roleGuard = requireRole('USER');
    const roleError = roleGuard(userRole);
    if (roleError) {
      return roleError;
    }

    // Step 3: Extract the 'q' query parameter for the search prefix.
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query || query.trim().length === 0) {
      return Response.json(
        { error: 'Query parameter "q" is required and must not be empty.' },
        { status: 400 },
      );
    }

    // Step 4: Delegate to AuthService.searchUsersByUsername.
    const results = await searchUsersByUsername(query.trim());

    // Step 5: Return the matching users.
    return Response.json({ users: results }, { status: 200 });
  } catch (error: unknown) {
    // Unexpected error — do not leak internal details.
    console.error('User search error:', error);
    return Response.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 },
    );
  }
}
