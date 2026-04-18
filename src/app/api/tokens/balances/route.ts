/**
 * GET /api/tokens/balances — Get all token balances for the authenticated user.
 *
 * Requires JWT authentication (handled by Edge middleware). Accessible
 * by both USER and MERCHANT roles. Queries all SEP-41 token contracts
 * associated with the user and returns their current balances via
 * Soroban RPC simulation.
 *
 * Middleware stack:
 * 1. JWT auth (Edge middleware — x-user-id / x-user-role headers)
 * 2. Role guard (USER or MERCHANT)
 * (No CSRF validation needed — GET is not state-mutating)
 *
 * Error mapping:
 * - 403: Role not authorized
 * - 500: Unexpected server error
 *
 * @see Requirements 7.4, 7.7
 */

import { getUserTokenBalances } from '@/lib/services/token.service';
import { requireRole } from '@/lib/middleware/role-guard';

export async function GET(request: Request) {
  try {
    // Step 1: Extract auth context from Edge middleware headers.
    const userId = request.headers.get('x-user-id');
    const userRole = request.headers.get('x-user-role');

    // Step 2: Role guard — USER and MERCHANT can view token balances.
    const roleGuard = requireRole('USER', 'MERCHANT');
    const roleError = roleGuard(userRole);
    if (roleError) {
      return roleError;
    }

    // Step 3: Query token balances via TokenService.
    const balances = await getUserTokenBalances(userId!);

    // Step 4: Return the balances array.
    return Response.json(balances, { status: 200 });
  } catch (error: unknown) {
    // Unexpected error — do not leak internal details.
    console.error('Token balances error:', error);
    return Response.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 },
    );
  }
}
