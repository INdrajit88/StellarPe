/**
 * POST /api/contracts/simulate — Simulate a Soroban smart contract call (read-only).
 *
 * Requires JWT authentication (handled by Edge middleware). Accessible
 * by USER and MERCHANT roles. Validates the request body with Zod,
 * converts native args to XDR ScVal, and delegates to
 * ContractService.simulateContract for a read-only simulation.
 *
 * This is a read-only operation — no wallet or secret key is needed.
 * The service uses a dummy account internally for the simulation.
 *
 * Middleware stack:
 * 1. JWT auth (Edge middleware — x-user-id / x-user-role headers)
 * 2. CSRF validation (POST — kept for consistency with other POST routes)
 * 3. Role guard (USER, MERCHANT)
 * 4. Zod validation (simulateContractSchema)
 *
 * Error mapping:
 * - 400: Validation failure
 * - 403: CSRF missing or role not authorized
 * - 500: Unexpected server error
 * - 502: Stellar simulation failed
 *
 * @see Requirement 5.3
 */

import {
  simulateContract,
  nativeToScVal,
  scValToNative,
} from '@/lib/services/contract.service';
import { simulateContractSchema } from '@/lib/validators/contract.validator';
import { validateRequest } from '@/lib/middleware/validator';
import { requireRole } from '@/lib/middleware/role-guard';
import { validateCsrf } from '@/lib/middleware/csrf';

export async function POST(request: Request) {
  try {
    // Step 1: CSRF validation — kept for consistency with other POST routes.
    const csrfError = validateCsrf(request);
    if (csrfError) {
      return csrfError;
    }

    // Step 2: Extract auth context from Edge middleware headers.
    const userRole = request.headers.get('x-user-role');

    // Step 3: Role guard — USER and MERCHANT can simulate contracts.
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

    const validation = validateRequest(simulateContractSchema, body);
    if (validation.error) {
      return validation.error;
    }

    const { contractId, functionName, args } = validation.data;

    // Step 5: Convert native args to xdr.ScVal for the contract call.
    const scValArgs = args.map((arg) => nativeToScVal(arg));

    // Step 6: Simulate the contract call via ContractService (read-only).
    const result = await simulateContract(contractId, functionName, scValArgs);

    // Step 7: Convert the xdr.ScVal return value to a native value.
    const returnValue = scValToNative(result.returnValue);

    // Step 8: Return success response.
    return Response.json({ returnValue }, { status: 200 });
  } catch (error: unknown) {
    // Handle Stellar simulation errors as 502 (bad gateway / upstream failure).
    if (
      error instanceof Error &&
      (error.message.includes('simulation failed') ||
        error.message.includes('Contract'))
    ) {
      return Response.json({ error: error.message }, { status: 502 });
    }

    // Unexpected error — do not leak internal details.
    console.error('Contract simulate error:', error);
    return Response.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 },
    );
  }
}
