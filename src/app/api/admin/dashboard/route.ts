/**
 * GET /api/admin/dashboard — Platform statistics for the admin dashboard.
 *
 * Requires JWT authentication (handled by Edge middleware which sets
 * x-user-id and x-user-role headers). Accessible only by the ADMIN role.
 *
 * Middleware stack:
 * 1. JWT auth (Edge middleware — x-user-id / x-user-role headers)
 * 2. Role guard (ADMIN only)
 *
 * Returns aggregated platform metrics:
 * - Total registered User count
 * - Total registered Merchant count
 * - Total Transaction count
 * - Total XLM volume transacted
 * - Count of failed transactions in the last 24 hours
 *
 * Error mapping:
 * - 403: Role not authorized (non-Admin)
 * - 500: Unexpected server error
 *
 * @see Requirements 12.1 (dashboard stats), 12.6 (admin-only access)
 */

import { getDashboardStats } from '@/lib/services/admin.service';
import { requireRole } from '@/lib/middleware/role-guard';

export async function GET(request: Request) {
  try {
    // Step 1: Extract auth context from Edge middleware headers.
    const userRole = request.headers.get('x-user-role');

    // Step 2: Role guard — only ADMIN can access the dashboard.
    const roleGuard = requireRole('ADMIN');
    const roleError = roleGuard(userRole);
    if (roleError) {
      return roleError;
    }

    // Step 3: Fetch aggregated platform stats from AdminService.
    const stats = await getDashboardStats();

    // Step 4: Return dashboard statistics.
    return Response.json(stats, { status: 200 });
  } catch (error: unknown) {
    // Unexpected error — do not leak internal details.
    console.error('Admin dashboard error:', error);
    return Response.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 },
    );
  }
}
