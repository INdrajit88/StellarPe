/**
 * WalletService — Custodial wallet creation and management.
 *
 * Orchestrates keypair generation, Friendbot funding, encryption of secret keys,
 * and persistent storage of wallet records. Provides wallet detail queries
 * (Stellar address + live balance) and internal-only secret key decryption
 * for transaction signing.
 *
 * SECURITY: The plaintext secret key is NEVER logged, returned in API responses,
 * or persisted outside of AES-256-GCM encrypted form. It exists in memory only
 * during wallet creation (briefly) and during transaction signing via decryptSecretKey.
 *
 * @see Requirements 2.1 (generate keypair server-side), 2.2 (fund via Friendbot),
 *      2.3 (AES-256-GCM encryption), 2.4 (store only ciphertext + public key),
 *      2.5 (return address + balance), 2.6 (retry Friendbot), 2.7 (never expose secret),
 *      2.8 (no browser extension required)
 */

import { generateKeypair, fundAccount, getBalance } from './stellar.service';
import { encrypt, decrypt } from './encryption.service';
import { prisma } from '@/lib/prisma';

/**
 * Creates a new custodial Stellar wallet for a user.
 *
 * Steps:
 * 1. Generate a random Stellar keypair via StellarService
 * 2. Fund the new account via Friendbot (with retry logic in StellarService)
 * 3. Encrypt the secret key using EncryptionService (AES-256-GCM)
 * 4. Store the wallet record in the database (public key + encrypted secret)
 *
 * @param userId - The ID of the user to create a wallet for.
 * @returns An object containing the new wallet's Stellar public key.
 * @throws Error if Friendbot funding fails after retries or if DB write fails.
 *
 * SECURITY: The plaintext secret key is held in memory only for the duration
 * of this function. It is encrypted before storage and never logged.
 *
 * @see Requirements 2.1, 2.2, 2.3, 2.4, 2.6
 */
export async function createWallet(userId: string): Promise<{ publicKey: string }> {
  // Step 1: Generate a new Stellar keypair on the server
  const { publicKey, secretKey } = generateKeypair();

  try {
    // Step 2: Fund the account via Friendbot (StellarService handles retries)
    await fundAccount(publicKey);

    // Step 3: Encrypt the secret key before persisting
    // The plaintext secretKey will be garbage-collected after this scope exits.
    const { ciphertext, iv, authTag } = encrypt(secretKey);

    // Step 4: Store the wallet record with only the encrypted secret key
    await prisma.wallet.create({
      data: {
        userId,
        stellarAddress: publicKey,
        encryptedSecretKey: ciphertext,
        encryptionIV: iv,
        authTag,
      },
    });

    return { publicKey };
  } catch (error: unknown) {
    // Re-throw with context but NEVER include the secret key in the error message
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to create wallet for user ${userId}: ${message}`);
  }
}

/**
 * Returns the Stellar address and live XLM balance for a user's wallet.
 *
 * Fetches the wallet record from the database, then queries the Horizon API
 * for the current balance. Only public information is returned.
 *
 * @param userId - The ID of the user whose wallet details to retrieve.
 * @returns An object with the Stellar address and current XLM balance.
 * @throws Error if the user has no wallet or if the Horizon query fails.
 *
 * @see Requirements 2.5
 */
export async function getWalletDetails(
  userId: string
): Promise<{ stellarAddress: string; balance: string }> {
  // Find the wallet record — only select the public key field.
  // SECURITY: We deliberately exclude encryptedSecretKey, encryptionIV, and
  // authTag from this query because they are not needed for balance lookups
  // and should never be loaded into memory unnecessarily.
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    select: { stellarAddress: true },
  });

  if (!wallet) {
    throw new Error(`No wallet found for user ${userId}`);
  }

  // Query Horizon for the live XLM balance
  const balance = await getBalance(wallet.stellarAddress);

  return {
    stellarAddress: wallet.stellarAddress,
    balance,
  };
}

/**
 * Decrypts and returns the plaintext secret key for a user's wallet.
 *
 * This method is INTERNAL ONLY — it must never be called from an API route
 * handler that returns the result to the client. It is used exclusively by
 * PaymentService to sign transactions on the server.
 *
 * @param userId - The ID of the user whose secret key to decrypt.
 * @returns The plaintext Stellar secret key.
 * @throws Error if the user has no wallet or if decryption fails.
 *
 * SECURITY: The caller is responsible for zeroing the returned secret key
 * from memory after use. This function NEVER logs the decrypted value.
 *
 * @see Requirements 2.3, 2.7
 */
export async function decryptSecretKey(userId: string): Promise<string> {
  // Retrieve the encrypted secret key fields from the database
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    select: {
      encryptedSecretKey: true,
      encryptionIV: true,
      authTag: true,
    },
  });

  if (!wallet) {
    throw new Error(`No wallet found for user ${userId}`);
  }

  // Decrypt the secret key using EncryptionService
  // The plaintext is returned to the caller (PaymentService) for signing only
  return decrypt(wallet.encryptedSecretKey, wallet.encryptionIV, wallet.authTag);
}
