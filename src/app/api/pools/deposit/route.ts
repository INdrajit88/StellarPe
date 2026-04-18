/**
 * POST /api/pools/deposit — Deposit tokens into a liquidity pool.
 *
 * Requires JWT authentication (handled by Edge middleware). Accessible
 * only by the MERCHANT role. Validates the request body with Zod,
 * and delegates to PoolService.deposit for on-chain deposit and LP share minting.
 *
 * Middleware stack:
 * 1. JWT auth (Edge middleware — x-user-id / x-user-role headers)
 * 2. CSRF validation (POST is state-mutating)
 * 3. Role guard (MERCHANT only)
 * 4. Zod validation (depositSchema)
 * // TODO: Apply rate limiting middleware
 *
 * Error mapping:
 * - 400: Validation failure, invalid PIN, missing wallet
 * - 403: CSRF missing or role not authorized
 * - 500: Unexpected server error
 * - 502: Stellar on-chain failure
 *
 * @see Requirements 8.2, 8.5, 8.6
 */

import { deposit } from '@/lib/services/pool.service';
import { depositSchema } from '@/lib/validators/pool.validator';
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

    // Step 3: Role guard — only MERCHANT can deposit into pools.
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

    const validation = validateRequest(depositSchema, body);
    if (validation.error) {
      return validation.error;
    }

    // Step 5: Deposit into the pool via PoolService.
    const result = await deposit({
      poolContractId: validation.data.poolContractId,
      amountA: validation.data.amountA,
      amountB: validation.data.amountB,
      merchantId: userId!,
      pin: validation.data.pin,
    });

    // Step 6: Return success response.
    return Response.json(
      {
        shares: result.shares,
        transactionHash: result.transactionHash,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    // Handle on-chain failures as 502 (upstream failure).
    if (error instanceof Error && (
      error.message.includes('Pool deposit failed on-chain') ||
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
        { error: 'Wallet not found. Please create a wallet before depositing.' },
        { status: 400 },
      );
    }

    // Unexpected error — do not leak internal details.
    console.error('Pool deposit error:', error);
    return Response.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 },
    );
  }
}
