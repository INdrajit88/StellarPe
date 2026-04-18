/**
 * POST /api/contracts/deploy — Deploy a Soroban smart contract.
 *
 * Requires JWT authentication (handled by Edge middleware). Accessible
 * only by the MERCHANT role. Validates the request body with Zod,
 * decodes the base64 WASM binary, retrieves the deployer's wallet,
 * and delegates to ContractService.deployContract for on-chain deployment.
 * The deployed contract metadata is stored in the Contract table.
 *
 * Middleware stack:
 * 1. JWT auth (Edge middleware — x-user-id / x-user-role headers)
 * 2. CSRF validation (POST is state-mutating)
 * 3. Role guard (MERCHANT only)
 * 4. Zod validation (deployContractSchema)
 *
 * Error mapping:
 * - 400: Validation failure, invalid base64, missing wallet
 * - 403: CSRF missing or role not authorized
 * - 500: Unexpected server error
 * - 502: Stellar deployment failed
 *
 * @see Requirements 4.1, 4.2, 4.3, 4.4, 4.5
 */

import { createHash } from 'crypto';
import { deployContract } from '@/lib/services/contract.service';
import { deployContractSchema } from '@/lib/validators/contract.validator';
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

    // Step 3: Role guard — only MERCHANT can deploy contracts.
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

    const validation = validateRequest(deployContractSchema, body);
    if (validation.error) {
      return validation.error;
    }

    // Step 5: Decode the base64 WASM binary.
    let wasmBuffer: Buffer;
    try {
      wasmBuffer = Buffer.from(validation.data.wasmBase64, 'base64');
      if (wasmBuffer.length === 0) {
        return Response.json(
          { error: 'WASM binary is empty after base64 decoding.' },
          { status: 400 },
        );
      }
    } catch {
      return Response.json(
        { error: 'Invalid base64 encoding for WASM binary.' },
        { status: 400 },
      );
    }

    // Step 6: Retrieve the deployer's wallet from the database.
    const wallet = await prisma.wallet.findUnique({
      where: { userId: userId! },
    });

    if (!wallet) {
      return Response.json(
        { error: 'Wallet not found. Please create a wallet before deploying contracts.' },
        { status: 400 },
      );
    }

    // Step 7: Decrypt the deployer's secret key for transaction signing.
    const deployerSecret = decrypt(
      wallet.encryptedSecretKey,
      wallet.encryptionIV,
      wallet.authTag,
    );

    // Step 8: Deploy the contract via ContractService.
    const result = await deployContract(wasmBuffer, deployerSecret);

    // Step 9: Compute the WASM hash (sha256) for the Contract record.
    const wasmHash = createHash('sha256').update(wasmBuffer).digest('hex');

    // Step 10: Store the deployed contract in the Contract table.
    await prisma.contract.create({
      data: {
        contractId: result.contractId,
        contractType: 'CUSTOM',
        wasmHash,
        deployerAddress: wallet.stellarAddress,
        deployerId: userId!,
        deployTxHash: result.transactionHash,
      },
    });

    // Step 11: Return success response.
    return Response.json(
      {
        contractId: result.contractId,
        transactionHash: result.transactionHash,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    // Handle Stellar deployment errors as 502 (bad gateway / upstream failure).
    if (error instanceof Error && (
      error.message.includes('rejected by network') ||
      error.message.includes('upload failed') ||
      error.message.includes('instantiation failed') ||
      error.message.includes('Contract')
    )) {
      return Response.json(
        { error: error.message },
        { status: 502 },
      );
    }

    // Unexpected error — do not leak internal details.
    console.error('Contract deploy error:', error);
    return Response.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 },
    );
  }
}
