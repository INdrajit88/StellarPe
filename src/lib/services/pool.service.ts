/**
 * PoolService — Liquidity pool contract interactions: deploy, deposit, withdraw, swap.
 *
 * Wraps ContractService for pool-specific operations:
 * - Deploy a new liquidity pool contract for two tokens
 * - Deposit tokens into a pool and receive LP shares
 * - Withdraw tokens by burning LP shares
 * - Swap tokens through a pool using constant-product formula (x * y = k)
 *
 * Deposit and withdraw require PIN verification (via PINService) and secret key
 * decryption (via EncryptionService). Swap simulates first to enforce slippage
 * protection before submitting the transaction.
 *
 * Inter-contract calls (pool contract calling token contracts for `transfer`)
 * are handled by including token contract authorizations in the `subAuth` parameter.
 *
 * The pool WASM binary path is configurable via the POOL_WASM_PATH env var.
 *
 * All environment configuration is read from process.env at call time — NOT at
 * module level — to avoid triggering env.ts validation during test imports.
 *
 * @see Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6
 */

import { prisma } from '@/lib/prisma';
import { decrypt } from './encryption.service';
import { verifyPin } from './pin.service';
import {
  deployContract,
  invokeContract,
  simulateContract,
  nativeToScVal,
  scValToNative,
} from './contract.service';
import type { SubContractAuth } from './contract.service';
import { Address } from '@stellar/stellar-sdk';
import fs from 'fs';
import path from 'path';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Swap fee percentage (0.3%) deducted by the pool contract before output calc. */
const SWAP_FEE_RATE = 0.003;

/**
 * Path to the pre-compiled liquidity pool WASM binary.
 * Configurable via the POOL_WASM_PATH environment variable.
 */
function getPoolWasmPath(): string {
  return (
    process.env.POOL_WASM_PATH ||
    path.join(process.cwd(), 'contracts', 'liquidity_pool.wasm')
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Verifies the user's PIN and decrypts their Stellar secret key.
 *
 * @param userId - The user's database ID.
 * @param pin - The plaintext PIN to verify.
 * @returns The plaintext Stellar secret key and the user's Stellar address.
 * @throws Error if PIN verification fails, user has no wallet, or decryption fails.
 *
 * SECURITY: The returned secret key must be used immediately for signing
 * and never logged or persisted.
 */
async function verifyAndDecrypt(
  userId: string,
  pin: string
): Promise<{ secretKey: string; stellarAddress: string }> {
  // Verify PIN before decrypting the secret key
  const pinValid = await verifyPin(userId, pin);
  if (!pinValid) {
    throw new Error('Invalid PIN. Transaction rejected.');
  }

  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    select: {
      encryptedSecretKey: true,
      encryptionIV: true,
      authTag: true,
      stellarAddress: true,
    },
  });

  if (!wallet) {
    throw new Error(`No wallet found for user ${userId}`);
  }

  const secretKey = decrypt(
    wallet.encryptedSecretKey,
    wallet.encryptionIV,
    wallet.authTag
  );

  return { secretKey, stellarAddress: wallet.stellarAddress };
}

/**
 * Builds sub-contract authorization entries for token transfer calls
 * made by the pool contract during deposit/withdraw/swap operations.
 *
 * When the pool contract calls `transfer` on a token contract, the caller
 * must include authorization entries for those inter-contract invocations.
 */
function buildTokenTransferAuth(
  tokenContractId: string,
  from: string,
  to: string,
  amount: string
): SubContractAuth {
  return {
    contractId: tokenContractId,
    functionName: 'transfer',
    args: [
      nativeToScVal(Address.fromString(from), { type: 'address' } as never),
      nativeToScVal(Address.fromString(to), { type: 'address' } as never),
      nativeToScVal(BigInt(amount), { type: 'i128' }),
    ],
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Deploys a new liquidity pool contract for two tokens.
 *
 * Reads the pre-compiled pool WASM binary and deploys it via
 * ContractService.deployContract().
 *
 * @param params - Pool deployment parameters.
 * @returns The deployed pool contract ID and the deployment transaction hash.
 * @throws Error if deployment fails.
 *
 * @see Requirement 8.1 (deploy liquidity pool contract)
 */
export async function deployPool(params: {
  tokenAContractId: string;
  tokenBContractId: string;
  deployerSecret: string;
}): Promise<{ poolContractId: string; transactionHash: string }> {
  const { deployerSecret } = params;

  // Read the pre-compiled pool WASM binary
  const wasmPath = getPoolWasmPath();
  let wasmBuffer: Buffer;
  try {
    wasmBuffer = fs.readFileSync(wasmPath);
  } catch (err) {
    throw new Error(
      `Failed to read pool WASM binary at ${wasmPath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Deploy the WASM contract
  const { contractId, transactionHash } = await deployContract(
    Buffer.from(wasmBuffer),
    deployerSecret
  );

  return {
    poolContractId: contractId,
    transactionHash,
  };
}

/**
 * Deposits tokens into a liquidity pool.
 *
 * Steps:
 * 1. Verify PIN via PINService
 * 2. Decrypt the merchant's secret key via EncryptionService
 * 3. Look up pool token pair from existing LPPosition or use provided context
 * 4. Invoke pool contract `deposit(depositor, amount_a, amount_b, min_shares)`
 *    with inter-contract token transfer authorizations in `subAuth`
 * 5. Store/update LPPosition in database
 *
 * @param params - Deposit parameters.
 * @returns The LP shares received and the transaction hash.
 * @throws Error if PIN is invalid, wallet not found, or on-chain failure.
 *
 * @see Requirement 8.2 (deposit tokens, mint LP shares)
 * @see Requirement 8.4 (enforce reserve ratio within 1% slippage)
 * @see Requirement 8.5 (descriptive error on on-chain failure)
 * @see Requirement 8.7 (store LP position in database)
 */
export async function deposit(params: {
  poolContractId: string;
  amountA: string;
  amountB: string;
  merchantId: string;
  pin: string;
  tokenAContractId?: string;
  tokenBContractId?: string;
}): Promise<{ shares: string; transactionHash: string }> {
  const {
    poolContractId,
    amountA,
    amountB,
    merchantId,
    pin,
    tokenAContractId,
    tokenBContractId,
  } = params;

  // Step 1 & 2: Verify PIN and decrypt secret key
  const { secretKey, stellarAddress } = await verifyAndDecrypt(merchantId, pin);

  // Build contract invocation arguments:
  // deposit(depositor, amount_a, amount_b, min_shares)
  const depositorScVal = nativeToScVal(
    Address.fromString(stellarAddress),
    { type: 'address' } as never
  );
  const amountAScVal = nativeToScVal(BigInt(amountA), { type: 'i128' });
  const amountBScVal = nativeToScVal(BigInt(amountB), { type: 'i128' });
  // min_shares = 0 (accept any amount of shares; slippage is enforced by the contract)
  const minSharesScVal = nativeToScVal(BigInt(0), { type: 'i128' });

  // Build sub-contract authorization entries for token transfers
  const subAuth: SubContractAuth[] = [];
  if (tokenAContractId) {
    subAuth.push(
      buildTokenTransferAuth(tokenAContractId, stellarAddress, poolContractId, amountA)
    );
  }
  if (tokenBContractId) {
    subAuth.push(
      buildTokenTransferAuth(tokenBContractId, stellarAddress, poolContractId, amountB)
    );
  }

  // Step 3: Invoke pool contract deposit function
  let result;
  try {
    result = await invokeContract(
      poolContractId,
      'deposit',
      [depositorScVal, amountAScVal, amountBScVal, minSharesScVal],
      secretKey,
      subAuth.length > 0 ? subAuth : undefined
    );
  } catch (err) {
    throw new Error(
      `Pool deposit failed on-chain: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Extract shares from the return value
  const shares = String(scValToNative(result.returnValue));

  // Step 4: Store/update LPPosition in database
  const existingPosition = await prisma.lPPosition.findUnique({
    where: {
      poolContractId_merchantId: {
        poolContractId,
        merchantId,
      },
    },
  });

  if (existingPosition) {
    // Add new shares to existing position
    const existingSharesBigInt = BigInt(existingPosition.shares.toString());
    const newSharesBigInt = BigInt(shares);
    const updatedShares = (existingSharesBigInt + newSharesBigInt).toString();

    await prisma.lPPosition.update({
      where: {
        poolContractId_merchantId: {
          poolContractId,
          merchantId,
        },
      },
      data: {
        shares: updatedShares,
        ...(tokenAContractId ? { tokenAContractId } : {}),
        ...(tokenBContractId ? { tokenBContractId } : {}),
      },
    });
  } else {
    await prisma.lPPosition.create({
      data: {
        poolContractId,
        merchantId,
        shares: shares,
        tokenAContractId: tokenAContractId || '',
        tokenBContractId: tokenBContractId || '',
      },
    });
  }

  return {
    shares,
    transactionHash: result.transactionHash,
  };
}

/**
 * Withdraws tokens from a liquidity pool by burning LP shares.
 *
 * Steps:
 * 1. Verify PIN via PINService
 * 2. Decrypt the merchant's secret key via EncryptionService
 * 3. Invoke pool contract `withdraw(withdrawer, shares, min_a, min_b)`
 * 4. Update LPPosition in database (reduce shares)
 *
 * @param params - Withdrawal parameters.
 * @returns The token amounts received and the transaction hash.
 * @throws Error if PIN is invalid, wallet not found, or on-chain failure.
 *
 * @see Requirement 8.3 (burn shares, return proportional token amounts)
 * @see Requirement 8.5 (descriptive error on on-chain failure)
 * @see Requirement 8.7 (update LP position in database)
 */
export async function withdraw(params: {
  poolContractId: string;
  shares: string;
  merchantId: string;
  pin: string;
}): Promise<{ amountA: string; amountB: string; transactionHash: string }> {
  const { poolContractId, shares, merchantId, pin } = params;

  // Step 1 & 2: Verify PIN and decrypt secret key
  const { secretKey, stellarAddress } = await verifyAndDecrypt(merchantId, pin);

  // Build contract invocation arguments:
  // withdraw(withdrawer, shares, min_a, min_b)
  const withdrawerScVal = nativeToScVal(
    Address.fromString(stellarAddress),
    { type: 'address' } as never
  );
  const sharesScVal = nativeToScVal(BigInt(shares), { type: 'i128' });
  // min_a and min_b = 0 (accept any returned amounts)
  const minAScVal = nativeToScVal(BigInt(0), { type: 'i128' });
  const minBScVal = nativeToScVal(BigInt(0), { type: 'i128' });

  // Invoke pool contract withdraw function
  let result;
  try {
    result = await invokeContract(
      poolContractId,
      'withdraw',
      [withdrawerScVal, sharesScVal, minAScVal, minBScVal],
      secretKey
    );
  } catch (err) {
    throw new Error(
      `Pool withdrawal failed on-chain: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Extract returned token amounts from the return value
  // The contract returns a tuple/struct with (amount_a, amount_b)
  const returnedAmounts = scValToNative(result.returnValue);
  const amountA = String(
    Array.isArray(returnedAmounts) ? returnedAmounts[0] : returnedAmounts.amount_a ?? returnedAmounts.a ?? '0'
  );
  const amountB = String(
    Array.isArray(returnedAmounts) ? returnedAmounts[1] : returnedAmounts.amount_b ?? returnedAmounts.b ?? '0'
  );

  // Update LPPosition in database — reduce shares
  const existingPosition = await prisma.lPPosition.findUnique({
    where: {
      poolContractId_merchantId: {
        poolContractId,
        merchantId,
      },
    },
  });

  if (existingPosition) {
    const existingSharesBigInt = BigInt(existingPosition.shares.toString());
    const withdrawSharesBigInt = BigInt(shares);
    const updatedSharesBigInt = existingSharesBigInt - withdrawSharesBigInt;

    if (updatedSharesBigInt <= BigInt(0)) {
      // Remove position if all shares are withdrawn
      await prisma.lPPosition.delete({
        where: {
          poolContractId_merchantId: {
            poolContractId,
            merchantId,
          },
        },
      });
    } else {
      await prisma.lPPosition.update({
        where: {
          poolContractId_merchantId: {
            poolContractId,
            merchantId,
          },
        },
        data: {
          shares: updatedSharesBigInt.toString(),
        },
      });
    }
  }

  return {
    amountA,
    amountB,
    transactionHash: result.transactionHash,
  };
}

/**
 * Swaps tokens through a liquidity pool.
 *
 * Steps:
 * 1. Verify PIN via PINService
 * 2. Decrypt the user's secret key via EncryptionService
 * 3. Simulate the swap to check output against minOutputAmount (slippage protection)
 * 4. If output >= minOutputAmount, submit the transaction
 * 5. Record SwapTransaction in database
 *
 * The 0.3% fee is deducted by the contract before calculating output via x * y = k.
 *
 * @param params - Swap parameters.
 * @returns The output amount, effective rate, fee amount, and transaction hash.
 * @throws Error if PIN is invalid, slippage exceeded, or on-chain failure.
 *
 * @see Requirement 9.1 (swap using constant-product formula)
 * @see Requirement 9.2 (return output amount and effective rate)
 * @see Requirement 9.3 (0.3% swap fee)
 * @see Requirement 9.4 (reject if output < minOutputAmount)
 * @see Requirement 9.6 (record swap in database)
 */
export async function swap(params: {
  poolContractId: string;
  inputToken: string;
  inputAmount: string;
  minOutputAmount: string;
  userId: string;
  pin: string;
}): Promise<{
  outputAmount: string;
  effectiveRate: string;
  feeAmount: string;
  transactionHash: string;
}> {
  const { poolContractId, inputToken, inputAmount, minOutputAmount, userId, pin } = params;

  // Step 1 & 2: Verify PIN and decrypt secret key
  const { secretKey, stellarAddress } = await verifyAndDecrypt(userId, pin);

  // Build contract invocation arguments:
  // swap(user, input_token, input_amount, min_output)
  const userScVal = nativeToScVal(
    Address.fromString(stellarAddress),
    { type: 'address' } as never
  );
  const inputTokenScVal = nativeToScVal(
    Address.fromString(inputToken),
    { type: 'address' } as never
  );
  const inputAmountScVal = nativeToScVal(BigInt(inputAmount), { type: 'i128' });
  const minOutputScVal = nativeToScVal(BigInt(minOutputAmount), { type: 'i128' });

  // Step 3: Simulate the swap first to check slippage
  let simulatedOutput: string;
  try {
    const simResult = await simulateContract(
      poolContractId,
      'swap',
      [userScVal, inputTokenScVal, inputAmountScVal, minOutputScVal]
    );
    simulatedOutput = String(scValToNative(simResult.returnValue));
  } catch (err) {
    throw new Error(
      `Swap simulation failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Check slippage protection: reject if simulated output < minOutputAmount
  if (BigInt(simulatedOutput) < BigInt(minOutputAmount)) {
    throw new Error(
      `Slippage protection: estimated output ${simulatedOutput} is below minimum ${minOutputAmount}. Swap rejected.`
    );
  }

  // Step 4: Submit the actual swap transaction
  // Build sub-contract auth for the token transfer from user to pool
  const subAuth: SubContractAuth[] = [
    buildTokenTransferAuth(inputToken, stellarAddress, poolContractId, inputAmount),
  ];

  let result;
  try {
    result = await invokeContract(
      poolContractId,
      'swap',
      [userScVal, inputTokenScVal, inputAmountScVal, minOutputScVal],
      secretKey,
      subAuth
    );
  } catch (err) {
    throw new Error(
      `Swap transaction failed on-chain: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Extract the actual output amount from the transaction result
  const outputAmount = String(scValToNative(result.returnValue));

  // Calculate fee and effective rate
  const feeAmount = (Number(inputAmount) * SWAP_FEE_RATE).toString();
  const effectiveRate =
    Number(inputAmount) > 0
      ? (Number(outputAmount) / Number(inputAmount)).toString()
      : '0';

  // Determine the output token (the other token in the pair)
  // Look up the pool's token pair from existing LP positions
  let outputToken = '';
  const poolPosition = await prisma.lPPosition.findFirst({
    where: { poolContractId },
    select: { tokenAContractId: true, tokenBContractId: true },
  });

  if (poolPosition) {
    outputToken =
      poolPosition.tokenAContractId === inputToken
        ? poolPosition.tokenBContractId
        : poolPosition.tokenAContractId;
  }

  // Step 5: Record SwapTransaction in database
  await prisma.swapTransaction.create({
    data: {
      poolContractId,
      userId,
      inputToken,
      outputToken,
      inputAmount: inputAmount,
      outputAmount: outputAmount,
      feeAmount: feeAmount,
      stellarTxHash: result.transactionHash,
    },
  });

  return {
    outputAmount,
    effectiveRate,
    feeAmount,
    transactionHash: result.transactionHash,
  };
}
