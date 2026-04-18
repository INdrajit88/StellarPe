/**
 * POST /api/pools/withdraw — Withdraw tokens from a liquidity pool.
 *
 * Requires JWT authentication (handled by Edge middleware). Accessible
 * only by the MERCHANT role. Validates the request body with Zod,
 * and delegates to PoolService.withdraw for on-chain withdrawal and LP share burning.
 *
 * Middleware stack:
 * 1. JWT auth (Edge middleware — x-user-id / x-user-role headers)
 * 2. CSRF validation (POST is state-mutating)
 * 3. Role guard (MERCHANT only)
 * 4. Zod validation (withdrawSchema)
 * // TODO: Apply rate limiting middleware
 *
 * Error mapping:
 * - 400: Validation failure, invalid PIN, missing wallet
 * - 403: CSRF missing or role not authorized
 * - 500: Unexpected server error
 * - 502: Stellar on-chain failure
 *
 * @see Requirements 8.3, 8.5, 8.6
 */

import { withdraw } from '@/lib/services/pool.service';
import { withdrawSchema } from '@/lib/validators/pool.validator';
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

    // Step 3: Role guard — only MERCHANT can withdraw from pools.
    const roleGuard = requireRole('MERCHANT');
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

    const validation = validateRequest(withdrawSchema, body);
    if (validation.error) {
      return validation.error;
    }

    // Step 5: Withdraw from the pool via PoolService.
    const result = await withdraw({
      poolContractId: validation.data.poolContractId,
      shares: validation.data.shares,
      merchantId: userId!,
      pin: validation.data.pin,
    });

    // Step 6: Return success response.
    return Response.json(
      {
        amountA: result.amountA,
        amountB: result.amountB,
        transactionHash: result.transactionHash,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    // Handle on-chain failures as 502 (upstream failure).
    if (error instanceof Error && (
      error.message.includes('Pool withdrawal failed on-chain') ||
      error.message.includes('rejected by network')
    )) {
      return Response.json(
        { error: error.message },
        { status: 502 },
      );
    }

    // Handle PIN verification failures.
    if (error instanceof Error && error.message.includes('Invalid PIN')) {
      return Response.json(
        { error: error.message },
        { status: 400 },
      );
    }

    // Handle missing wallet errors.
    if (error instanceof Error && error.message.includes('No wallet found')) {
      return Response.json(
        { error: 'Wallet not found. Please create a wallet before withdrawing.' },
        { status: 400 },
      );
    }

    // Unexpected error — do not leak internal details.
    console.error('Pool withdraw error:', error);
    return Response.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 },
    );
  }
}
