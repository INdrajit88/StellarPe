/**
 * POST /api/pools/swap — Swap tokens through a liquidity pool.
 *
 * Requires JWT authentication (handled by Edge middleware). Accessible
 * by both USER and MERCHANT roles. Validates the request body with Zod,
 * and delegates to PoolService.swap for simulation, slippage check, and
 * on-chain swap execution using the constant-product formula (x * y = k).
 *
 * Middleware stack:
 * 1. JWT auth (Edge middleware — x-user-id / x-user-role headers)
 * 2. CSRF validation (POST is state-mutating)
 * 3. Role guard (USER or MERCHANT)
 * 4. Zod validation (swapSchema)
 * // TODO: Apply rate limiting middleware
 *
 * Error mapping:
 * - 400: Validation failure, invalid PIN, missing wallet, slippage protection
 * - 403: CSRF missing or role not authorized
 * - 500: Unexpected server error
 * - 502: Stellar on-chain failure
 *
 * @see Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 */

import { swap } from '@/lib/services/pool.service';
import { swapSchema } from '@/lib/validators/pool.validator';
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

    // Step 3: Role guard — USER and MERCHANT can swap tokens.
    const roleGuard = requireRole('USER', 'MERCHANT');
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

    const validation = validateRequest(swapSchema, body);
    if (validation.error) {
      return validation.error;
    }

    // Step 5: Execute the swap via PoolService.
    const result = await swap({
      poolContractId: validation.data.poolContractId,
      inputToken: validation.data.inputToken,
      inputAmount: validation.data.inputAmount,
      minOutputAmount: validation.data.minOutputAmount,
      userId: userId!,
      pin: validation.data.pin,
    });

    // Step 6: Return success response.
    return Response.json(
      {
        outputAmount: result.outputAmount,
        effectiveRate: result.effectiveRate,
        feeAmount: result.feeAmount,
        transactionHash: result.transactionHash,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    // Handle slippage protection errors as 400 (client error).
    if (error instanceof Error && error.message.includes('Slippage protection')) {
      return Response.json(
        { error: error.message },
        { status: 400 },
      );
    }

    // Handle on-chain failures as 502 (upstream failure).
    if (error instanceof Error && (
      error.message.includes('Swap transaction failed on-chain') ||
      error.message.includes('Swap simulation failed') ||
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
        { error: 'Wallet not found. Please create a wallet before swapping.' },
        { status: 400 },
      );
    }

    // Unexpected error — do not leak internal details.
    console.error('Pool swap error:', error);
    return Response.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 },
    );
  }
}
