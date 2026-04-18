/**
 * POST /api/tokens/create — Create a new SEP-41 token contract.
 *
 * Requires JWT authentication (handled by Edge middleware). Accessible
 * only by the MERCHANT role. Validates the request body with Zod,
 * and delegates to TokenService.createToken for on-chain deployment,
 * initialization, and initial supply minting.
 *
 * Middleware stack:
 * 1. JWT auth (Edge middleware — x-user-id / x-user-role headers)
 * 2. CSRF validation (POST is state-mutating)
 * 3. Role guard (MERCHANT only)
 * 4. Zod validation (createTokenSchema)
 *
 * Error mapping:
 * - 400: Validation failure, invalid parameters
 * - 403: CSRF missing or role not authorized
 * - 500: Unexpected server error
 * - 502: Stellar deployment/invocation failed
 *
 * @see Requirements 7.1, 7.2, 7.3, 7.5, 7.6
 */

import { createToken } from '@/lib/services/token.service';
import { createTokenSchema } from '@/lib/validators/token.validator';
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

    // Step 3: Role guard — only MERCHANT can create tokens.
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

    const validation = validateRequest(createTokenSchema, body);
    if (validation.error) {
      return validation.error;
    }

    // Step 5: Create the token via TokenService.
    const result = await createToken({
      name: validation.data.name,
      symbol: validation.data.symbol,
      decimals: validation.data.decimals,
      initialSupply: validation.data.initialSupply,
      merchantId: userId!,
    });

    // Step 6: Return success response.
    return Response.json(
      {
        contractId: result.contractId,
        transactionHash: result.transactionHash,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    // Handle Stellar deployment/invocation errors as 502 (upstream failure).
    if (error instanceof Error && (
      error.message.includes('rejected by network') ||
      error.message.includes('upload failed') ||
      error.message.includes('instantiation failed') ||
      error.message.includes('Contract') ||
      error.message.includes('mint') ||
      error.message.includes('initialize')
    )) {
      return Response.json(
        { error: error.message },
        { status: 502 },
      );
    }

    // Handle known validation errors from the service layer.
    if (error instanceof Error && error.message.includes('Invalid decimals')) {
      return Response.json(
        { error: error.message },
        { status: 400 },
      );
    }

    // Handle missing wallet errors.
    if (error instanceof Error && error.message.includes('No wallet found')) {
      return Response.json(
        { error: 'Wallet not found. Please create a wallet before creating tokens.' },
        { status: 400 },
      );
    }

    // Unexpected error — do not leak internal details.
    console.error('Token create error:', error);
    return Response.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 },
    );
  }
}
