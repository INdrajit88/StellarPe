/**
 * TokenService — SEP-41 token contract deployment and balance queries.
 *
 * Wraps ContractService for token-specific operations:
 * - Deploy a new SEP-41 token contract and mint initial supply
 * - Query token balance for an address via Soroban RPC simulation
 * - Query all token balances for a user (batch Soroban RPC calls)
 *
 * The deployer keypair is the merchant's encrypted secret key, decrypted
 * via EncryptionService. Decimal validation (0–18) happens at the service level.
 *
 * All environment configuration is read from process.env at call time — NOT at
 * module level — to avoid triggering env.ts validation during test imports.
 *
 * @see Requirements 7.1, 7.2, 7.3, 7.4, 7.5
 */

import { prisma } from '@/lib/prisma';
import { decrypt } from './encryption.service';
import {
  deployContract,
  invokeContract,
  simulateContract,
  nativeToScVal,
  scValToNative,
} from './contract.service';
import { Address } from '@stellar/stellar-sdk';
import fs from 'fs';
import path from 'path';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Minimum allowed decimal precision for a token. */
const MIN_DECIMALS = 0;

/** Maximum allowed decimal precision for a token. */
const MAX_DECIMALS = 18;

/**
 * Path to the pre-compiled SEP-41 token WASM binary.
 * Configurable via the TOKEN_WASM_PATH environment variable.
 * Defaults to a placeholder path since the actual WASM is out of scope.
 */
function getTokenWasmPath(): string {
  return (
    process.env.TOKEN_WASM_PATH ||
    path.join(process.cwd(), 'contracts', 'sep41_token.wasm')
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Decrypts the merchant's Stellar secret key from the Wallet table.
 *
 * @param merchantId - The merchant's user ID.
 * @returns The plaintext Stellar secret key.
 * @throws Error if the merchant has no wallet.
 *
 * SECURITY: The returned secret key must be used immediately for signing
 * and never logged or persisted.
 */
async function decryptMerchantSecret(merchantId: string): Promise<string> {
  const wallet = await prisma.wallet.findUnique({
    where: { userId: merchantId },
    select: {
      encryptedSecretKey: true,
      encryptionIV: true,
      authTag: true,
      stellarAddress: true,
    },
  });

  if (!wallet) {
    throw new Error(`No wallet found for merchant ${merchantId}`);
  }

  const secretKey = decrypt(
    wallet.encryptedSecretKey,
    wallet.encryptionIV,
    wallet.authTag
  );

  return secretKey;
}

/**
 * Retrieves the merchant's Stellar public address from the Wallet table.
 *
 * @param merchantId - The merchant's user ID.
 * @returns The Stellar public address.
 * @throws Error if the merchant has no wallet.
 */
async function getMerchantAddress(merchantId: string): Promise<string> {
  const wallet = await prisma.wallet.findUnique({
    where: { userId: merchantId },
    select: { stellarAddress: true },
  });

  if (!wallet) {
    throw new Error(`No wallet found for merchant ${merchantId}`);
  }

  return wallet.stellarAddress;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Deploys a new SEP-41 token contract and mints the initial supply.
 *
 * Steps:
 * 1. Validate decimal precision (0–18)
 * 2. Decrypt the merchant's secret key from the Wallet table
 * 3. Read the pre-compiled SEP-41 WASM binary
 * 4. Deploy the WASM via ContractService.deployContract()
 * 5. Invoke initialize(admin, decimals, name, symbol) on the new contract
 * 6. Invoke mint(to, amount) to mint the initial supply to the merchant
 * 7. Store token metadata in the Token table
 *
 * @param params - Token creation parameters.
 * @returns The deployed contract ID and the deployment transaction hash.
 * @throws Error if decimals are out of range, deployment fails, or invocation fails.
 *
 * @see Requirement 7.1 (deploy SEP-41 token contract)
 * @see Requirement 7.2 (mint initial supply to merchant)
 * @see Requirement 7.3 (store token metadata in database)
 * @see Requirement 7.5 (validate decimal precision 0–18)
 */
export async function createToken(params: {
  name: string;
  symbol: string;
  decimals: number;
  initialSupply: string;
  merchantId: string;
}): Promise<{ contractId: string; transactionHash: string }> {
  const { name, symbol, decimals, initialSupply, merchantId } = params;

  // Step 1: Validate decimal precision at the service level
  if (
    !Number.isInteger(decimals) ||
    decimals < MIN_DECIMALS ||
    decimals > MAX_DECIMALS
  ) {
    throw new Error(
      `Invalid decimals: ${decimals}. Must be an integer between ${MIN_DECIMALS} and ${MAX_DECIMALS}.`
    );
  }

  // Step 2: Decrypt the merchant's secret key and get their address
  const [merchantSecret, merchantAddress] = await Promise.all([
    decryptMerchantSecret(merchantId),
    getMerchantAddress(merchantId),
  ]);

  // Step 3: Read the pre-compiled SEP-41 WASM binary
  const wasmPath = getTokenWasmPath();
  const wasmBuffer = fs.readFileSync(wasmPath);

  // Step 4: Deploy the WASM contract
  const { contractId, transactionHash } = await deployContract(
    Buffer.from(wasmBuffer),
    merchantSecret
  );

  // Step 5: Invoke initialize(admin, decimals, name, symbol)
  const adminScVal = nativeToScVal(
    Address.fromString(merchantAddress),
    { type: 'address' } as never
  );
  const decimalsScVal = nativeToScVal(decimals, { type: 'u32' });
  const nameScVal = nativeToScVal(name, { type: 'string' });
  const symbolScVal = nativeToScVal(symbol, { type: 'string' });

  await invokeContract(
    contractId,
    'initialize',
    [adminScVal, decimalsScVal, nameScVal, symbolScVal],
    merchantSecret
  );

  // Step 6: Invoke mint(to, amount) to mint initial supply to the merchant
  const toScVal = nativeToScVal(
    Address.fromString(merchantAddress),
    { type: 'address' } as never
  );
  const amountScVal = nativeToScVal(BigInt(initialSupply), { type: 'i128' });

  await invokeContract(
    contractId,
    'mint',
    [toScVal, amountScVal],
    merchantSecret
  );

  // Step 7: Store token metadata in the Token table
  await prisma.token.create({
    data: {
      contractId,
      name,
      symbol,
      decimals,
      deployerId: merchantId,
    },
  });

  return { contractId, transactionHash };
}

/**
 * Queries the token balance for a specific address on a token contract.
 *
 * Uses ContractService.simulateContract() to call the balance(address) function
 * on the token contract — a read-only call that does not submit a transaction.
 *
 * @param contractId - The Soroban token contract ID (C... address).
 * @param address - The Stellar address to query the balance for.
 * @returns The token balance as a string.
 *
 * @see Requirement 7.4 (query token balance via Soroban RPC)
 */
export async function getTokenBalance(
  contractId: string,
  address: string
): Promise<string> {
  const addressScVal = nativeToScVal(
    Address.fromString(address),
    { type: 'address' } as never
  );

  const { returnValue } = await simulateContract(
    contractId,
    'balance',
    [addressScVal]
  );

  // Convert the i128 ScVal return value to a string
  const balance = scValToNative(returnValue);
  return String(balance);
}

/**
 * Queries all token balances for a user.
 *
 * Steps:
 * 1. Look up the user's Stellar address from the Wallet table
 * 2. Query the Token table for all tokens deployed by the user
 * 3. Batch-query balances via Soroban RPC for each token
 *
 * @param userId - The user ID to query token balances for.
 * @returns An array of token balance objects.
 *
 * @see Requirement 7.4 (query all token balances for a user)
 */
export async function getUserTokenBalances(
  userId: string
): Promise<
  Array<{
    contractId: string;
    name: string;
    symbol: string;
    decimals: number;
    balance: string;
  }>
> {
  // Get the user's Stellar address
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    select: { stellarAddress: true },
  });

  if (!wallet) {
    return [];
  }

  // Query all tokens associated with this user (deployed by them)
  const tokens = await prisma.token.findMany({
    where: { deployerId: userId },
    select: {
      contractId: true,
      name: true,
      symbol: true,
      decimals: true,
    },
  });

  if (tokens.length === 0) {
    return [];
  }

  // Batch-query balances via Soroban RPC
  const results = await Promise.allSettled(
    tokens.map(async (token) => {
      try {
        const balance = await getTokenBalance(
          token.contractId,
          wallet.stellarAddress
        );
        return {
          contractId: token.contractId,
          name: token.name,
          symbol: token.symbol,
          decimals: token.decimals,
          balance,
        };
      } catch {
        // If a balance query fails (e.g. contract not found), return "0"
        return {
          contractId: token.contractId,
          name: token.name,
          symbol: token.symbol,
          decimals: token.decimals,
          balance: '0',
        };
      }
    })
  );

  // Extract fulfilled results (all should be fulfilled due to inner try/catch)
  return results
    .filter(
      (r): r is PromiseFulfilledResult<{
        contractId: string;
        name: string;
        symbol: string;
        decimals: number;
        balance: string;
      }> => r.status === 'fulfilled'
    )
    .map((r) => r.value);
}
