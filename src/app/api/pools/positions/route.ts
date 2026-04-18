/**
 * GET /api/pools/positions — Get all LP positions for the authenticated merchant.
 *
 * Requires JWT authentication (handled by Edge middleware). Accessible
 * only by the MERCHANT role. Queries the LPPosition table for all
 * positions belonging to the authenticated merchant.
 *
 * Middleware stack:
 * 1. JWT auth (Edge middleware — x-user-id / x-user-role headers)
 * 2. Role guard (MERCHANT only)
 * (No CSRF validation needed — GET is not state-mutating)
 *
 * Error mapping:
 * - 403: Role not authorized
 * - 500: Unexpected server error
 *
 * @see Requirements 8.7, 10.2
 */

import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/middleware/role-guard';

export async function GET(request: Request) {
  try {
    // Step 1: Extract auth context from Edge middleware headers.
    const userId = request.headers.get('x-user-id');
    const userRole = request.headers.get('x-user-role');

    // Step 2: Role guard — only MERCHANT can view LP positions.
    const roleGuard = requireRole('MERCHANT');
    const roleError = roleGuard(userRole);
    if (roleError) {
      return roleError;
    }

    // Step 3: Query LP positions for the authenticated merchant.
    const positions = await prisma.lPPosition.findMany({
      where: { merchantId: userId! },
      select: {
        id: true,
        poolContractId: true,
        shares: true,
        tokenAContractId: true,
        tokenBContractId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Step 4: Serialize Decimal shares to strings for JSON response.
    const serialized = positions.map((pos) => ({
      ...pos,
      shares: pos.shares.toString(),
    }));

    // Step 5: Return the positions array.
    return Response.json(serialized, { status: 200 });
  } catch (error: unknown) {
    // Unexpected error — do not leak internal details.
    console.error('Pool positions error:', error);
    return Response.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 },
    );
  }
}
