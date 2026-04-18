/**
 * POST /api/contracts/invoke — Invoke a Soroban smart contract function.
 *
 * Requires JWT authentication (handled by Edge middleware). Accessible
 * by USER and MERCHANT roles. Validates the request body with Zod,
 * converts native args to XDR ScVal, retrieves the caller's wallet,
 * and delegates to ContractService.invokeContract for on-chain execution.
 *
 * Middleware stack:
 * 1. JWT auth (Edge middleware — x-user-id / x-user-role headers)
 * 2. CSRF validation (POST is state-mutating)
 * 3. Role guard (USER, MERCHANT)
 * 4. Zod validation (invokeContractSchema)
 *
 * Error mapping:
 * - 400: Validation failure, missing wallet
 * - 403: CSRF missing or role not authorized
 * - 500: Unexpected server error
 * - 502: Stellar invocation failed
 *
 * @see Requirements 5.1, 5.2, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5
 */

import {
  invokeContract,
  nativeToScVal,
  scValToNative,
} from '@/lib/services/contract.service';
import type { SubContractAuth } from '@/lib/services/contract.service';
import { invokeContractSchema } from '@/lib/validators/contract.validator';
import { validateRequest } from '@/lib/middleware/validator';
import { requireRole } from '@/lib/middleware/role-guard';
import { validateCsrf } from '@/lib/middleware/csrf';
import { decrypt } from '@/lib/services/encryption.service';
import { prisma } from '@/lib/prisma';

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

    // Step 3: Role guard — USER and MERCHANT can invoke contracts.
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

    const validation = validateRequest(invokeContractSchema, body);
    if (validation.error) {
      return validation.error;
    }

    const { contractId, functionName, args, subAuth } = validation.data;

    // Step 5: Retrieve the caller's wallet from the database.
    const wallet = await prisma.wallet.findUnique({
      where: { userId: userId! },
    });

    if (!wallet) {
      return Response.json(
        { error: 'Wallet not found. Please create a wallet before invoking contracts.' },
        { status: 400 },
      );
    }

    // Step 6: Decrypt the caller's secret key for transaction signing.
    const callerSecret = decrypt(
      wallet.encryptedSecretKey,
      wallet.encryptionIV,
      wallet.authTag,
    );

    // Step 7: Convert native args to xdr.ScVal for the contract call.
    const scValArgs = args.map((arg) => nativeToScVal(arg));

    // Step 8: Convert subAuth args to xdr.ScVal if provided.
    let subAuthEntries: SubContractAuth[] | undefined;
    if (subAuth && subAuth.length > 0) {
      subAuthEntries = subAuth.map((entry) => ({
        contractId: entry.contractId,
        functionName: entry.functionName,
        args: (entry.args as unknown[]).map((arg) => nativeToScVal(arg)),
      }));
    }

    // Step 9: Invoke the contract via ContractService.
    const result = await invokeContract(
      contractId,
      functionName,
      scValArgs,
      callerSecret,
      subAuthEntries,
    );

    // Step 10: Convert the xdr.ScVal return value to a native value.
    const returnValue = scValToNative(result.returnValue);

    // Step 11: Return success response.
    return Response.json(
      {
        transactionHash: result.transactionHash,
        returnValue,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    // Handle Stellar invocation errors as 502 (bad gateway / upstream failure).
    if (error instanceof Error && (
      error.message.includes('rejected by network') ||
      error.message.includes('invocation failed') ||
      error.message.includes('simulation failed') ||
      error.message.includes('missing authorization') ||
      error.message.includes('Contract')
    )) {
      return Response.json(
        { error: error.message },
        { status: 502 },
      );
    }

    // Unexpected error — do not leak internal details.
    console.error('Contract invoke error:', error);
    return Response.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 },
    );
  }
}
