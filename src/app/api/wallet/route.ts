/**
 * GET /api/wallet — Return wallet details and live XLM balance.
 *
 * Requires JWT authentication (handled by Edge middleware which sets
 * x-user-id and x-user-role headers). Accessible by USER and MERCHANT roles.
 *
 * Middleware stack:
 * 1. JWT auth (Edge middleware — x-user-id / x-user-role headers)
 * 2. Role guard (USER, MERCHANT)
 * 3. Rate limiter (payment rate limiter — 20 req/user/min)
 *
 * Returns the user's Stellar address and current XLM balance from Horizon.
 *
 * Error mapping:
 * - 403: Role not authorized
 * - 404: No wallet found for user
 * - 429: Rate limit exceeded
 * - 500: Unexpected server error
 *
 * @see Requirements 2.5 (return address + balance from Horizon)
 */

import { getWalletDetails } from '@/lib/services/wallet.service';
import { requireRole } from '@/lib/middleware/role-guard';
import { paymentRateLimiter } from '@/lib/middleware/rate-limiter';

export async function GET(request: Request) {
  try {
    // Step 1: Extract auth context from Edge middleware headers.
    const userId = request.headers.get('x-user-id');
    const userRole = request.headers.get('x-user-role');

    // Step 2: Role guard — only USER and MERCHANT can access wallet details.
    const roleGuard = requireRole('USER', 'MERCHANT');
    const roleError = roleGuard(userRole);
    if (roleError) {
      return roleError;
    }

    // Step 3: Rate limit check by user ID.
    const rateLimitResult = paymentRateLimiter.check(userId!);

    if (!rateLimitResult.allowed) {
      return Response.json(
        {
          error: 'Too many requests. Please try again later.',
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000)),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(rateLimitResult.resetAt),
          },
        },
      );
    }

    // Step 4: Fetch wallet details from WalletService.
    const walletDetails = await getWalletDetails(userId!);

    // Step 5: Return wallet details.
    return Response.json(
      {
        stellarAddress: walletDetails.stellarAddress,
        balance: walletDetails.balance,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    // Handle "no wallet found" errors as 404.
    if (error instanceof Error && error.message.includes('No wallet found')) {
      return Response.json(
        { error: 'No wallet found for this account.' },
        { status: 404 },
      );
    }

    // Unexpected error — do not leak internal details.
    console.error('Wallet details error:', error);
    return Response.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 },
    );
  }
}
