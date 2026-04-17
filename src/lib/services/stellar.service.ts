/**
 * StellarService — Stellar blockchain interactions via the Horizon API.
 *
 * Wraps the @stellar/stellar-sdk v15 to provide:
 * - Keypair generation for custodial wallets
 * - Friendbot funding (testnet) with retry logic
 * - Balance queries via Horizon
 * - Payment transaction building, signing, and submission
 * - Real-time payment streaming via Horizon SSE
 *
 * All environment configuration (HORIZON_URL, STELLAR_NETWORK_PASSPHRASE) is
 * read from process.env at call time — NOT at module level — to avoid triggering
 * env.ts validation (which calls process.exit) during test imports.
 *
 * @see Requirements 2.1 (keypair generation), 2.2 (Friendbot funding),
 *      2.5 (balance query), 2.6 (retry logic), 3.5 (sign & submit),
 *      3.6 (record transaction), 5.2 (payment streaming)
 */

import {
  Keypair,
  Horizon,
  TransactionBuilder,
  Networks,
  Operation,
  Asset,
  Memo,
  BASE_FEE,
} from '@stellar/stellar-sdk';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Default Horizon URL when HORIZON_URL env var is not set. */
const DEFAULT_HORIZON_URL = 'https://horizon-testnet.stellar.org';

/** Maximum number of Friendbot funding attempts before giving up. */
const FRIENDBOT_MAX_RETRIES = 3;

/** Delay between Friendbot retry attempts in milliseconds. */
const FRIENDBOT_RETRY_DELAY_MS = 1000;

/** Transaction submission timeout in seconds. */
const TX_TIMEOUT_SECONDS = 30;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns the Horizon server URL from process.env, falling back to the
 * Stellar testnet endpoint if not set.
 */
function getHorizonUrl(): string {
  return process.env.HORIZON_URL || DEFAULT_HORIZON_URL;
}

/**
 * Returns the Stellar network passphrase from process.env, falling back to
 * the public testnet passphrase if not set.
 */
function getNetworkPassphrase(): string {
  return process.env.STELLAR_NETWORK_PASSPHRASE || Networks.TESTNET;
}

/**
 * Creates a new Horizon.Server instance pointed at the configured URL.
 * A fresh instance is created per call so that env changes between
 * calls (e.g. in tests) are respected. This avoids stale configuration
 * when tests override HORIZON_URL between test cases.
 */
function getServer(): InstanceType<typeof Horizon.Server> {
  return new Horizon.Server(getHorizonUrl());
}

/**
 * Sleeps for the specified number of milliseconds.
 * Used for retry delays in Friendbot funding.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Generates a new random Stellar keypair.
 *
 * Uses the Stellar SDK's Keypair.random() which produces a
 * cryptographically secure Ed25519 keypair.
 *
 * @returns An object containing the public key (Stellar address) and secret key.
 *
 * SECURITY: The secret key returned here must be encrypted before storage
 * and never exposed in API responses or logs.
 */
export function generateKeypair(): { publicKey: string; secretKey: string } {
  // Generate a random Ed25519 keypair via the Stellar SDK
  const keypair = Keypair.random();

  return {
    publicKey: keypair.publicKey(),
    secretKey: keypair.secret(),
  };
}

/**
 * Funds a Stellar account via the testnet Friendbot faucet.
 *
 * Friendbot creates the account on the ledger and credits it with 10,000
 * test XLM. This function retries up to 3 times with a 1-second delay
 * between attempts to handle transient network failures.
 *
 * @param publicKey - The Stellar public key to fund.
 * @throws Error if all retry attempts are exhausted.
 *
 * @see Requirement 2.2 (fund via Friendbot), 2.6 (3 retries)
 */
export async function fundAccount(publicKey: string): Promise<void> {
  const server = getServer();
  let lastError: unknown;

  for (let attempt = 1; attempt <= FRIENDBOT_MAX_RETRIES; attempt++) {
    try {
      // Call the Friendbot endpoint via the Horizon server instance.
      // server.friendbot(address) returns a FriendbotBuilder; .call() executes the request.
      await server.friendbot(publicKey).call();
      return; // Success — exit immediately
    } catch (error: unknown) {
      lastError = error;

      // If we haven't exhausted all retries, wait before the next attempt
      if (attempt < FRIENDBOT_MAX_RETRIES) {
        await sleep(FRIENDBOT_RETRY_DELAY_MS);
      }
    }
  }

  // All retries exhausted — throw with context
  throw new Error(
    `Failed to fund account ${publicKey} via Friendbot after ${FRIENDBOT_MAX_RETRIES} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

/**
 * Queries the Horizon API for the current native XLM balance of an account.
 *
 * Loads the full account record and extracts the balance line where
 * `asset_type` is `"native"` (XLM).
 *
 * @param publicKey - The Stellar public key to query.
 * @returns The XLM balance as a string (e.g. "9999.9999900").
 * @throws Error if the account is not found or the request fails.
 *
 * @see Requirement 2.5 (return XLM balance from Horizon)
 */
export async function getBalance(publicKey: string): Promise<string> {
  const server = getServer();

  // Load the full account record from Horizon
  const account = await server.loadAccount(publicKey);

  // Find the native (XLM) balance line in the account's balances array.
  // Every funded Stellar account has at least one native balance entry.
  const nativeBalance = account.balances.find(
    (b) => b.asset_type === 'native'
  );

  if (!nativeBalance) {
    throw new Error(`No native balance found for account ${publicKey}`);
  }

  return nativeBalance.balance;
}

/**
 * Builds, signs, and submits a Stellar payment transaction.
 *
 * Steps:
 * 1. Load the sender account to get the current sequence number
 * 2. Build a transaction with a payment operation (native XLM)
 * 3. Optionally attach a text memo
 * 4. Sign the transaction with the sender's secret key
 * 5. Submit to the Horizon API
 *
 * @param senderSecret - The sender's Stellar secret key for signing.
 * @param recipientPublic - The recipient's Stellar public key.
 * @param amount - The amount of XLM to send (as a string, e.g. "10.5").
 * @param memo - Optional text memo to attach to the transaction.
 * @returns An object containing the Stellar transaction ID (hash).
 * @throws Error if the transaction is rejected by Horizon.
 *
 * SECURITY: The senderSecret should be held in memory only for the duration
 * of this call and zeroed afterwards by the caller.
 *
 * @see Requirement 3.5 (decrypt, sign, submit server-side), 3.6 (record result)
 */
export async function submitPayment(
  senderSecret: string,
  recipientPublic: string,
  amount: string,
  memo?: string
): Promise<{ transactionId: string }> {
  const server = getServer();
  const networkPassphrase = getNetworkPassphrase();

  // Reconstruct the sender's keypair from the secret key for signing
  const senderKeypair = Keypair.fromSecret(senderSecret);
  const senderPublic = senderKeypair.publicKey();

  // Load the sender's account to obtain the current sequence number.
  // The sequence number is required by TransactionBuilder to construct a valid transaction.
  const senderAccount = await server.loadAccount(senderPublic);

  // Build the transaction with a single payment operation.
  // - Asset.native() represents XLM on the Stellar network
  // - BASE_FEE is the minimum fee per operation (100 stroops)
  // - setTimeout sets the transaction validity window
  const txBuilder = new TransactionBuilder(senderAccount, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      Operation.payment({
        destination: recipientPublic,
        asset: Asset.native(),
        amount,
      })
    )
    .setTimeout(TX_TIMEOUT_SECONDS);

  // Attach memo if provided — used for payment descriptions/references
  if (memo) {
    txBuilder.addMemo(Memo.text(memo));
  }

  // Finalize the transaction (sets sequence number, timebounds, etc.)
  const transaction = txBuilder.build();

  // Sign the transaction with the sender's keypair.
  // This proves the sender authorized the payment.
  transaction.sign(senderKeypair);

  // Submit the signed transaction to the Horizon API for inclusion in the ledger
  const result = await server.submitTransaction(transaction);

  return {
    transactionId: result.hash,
  };
}

/**
 * Opens a streaming cursor on Horizon to listen for inbound payments
 * to a specific Stellar account.
 *
 * Uses Horizon's SSE (Server-Sent Events) streaming interface to receive
 * real-time payment notifications. The cursor is set to "now" so only
 * new payments after the stream opens are reported.
 *
 * @param publicKey - The Stellar public key to monitor for incoming payments.
 * @param onPayment - Callback invoked for each incoming payment operation.
 * @returns A close function that stops the stream when called.
 *
 * @see Requirement 5.2 (stream payment events from Horizon)
 */
export function streamPayments(
  publicKey: string,
  onPayment: (payment: Record<string, unknown>) => void
): () => void {
  const server = getServer();

  // Open a streaming connection to Horizon's payments endpoint,
  // filtered to only payments involving the given account.
  // cursor: "now" means we only receive new payments from this point forward.
  const closeStream = server
    .payments()
    .forAccount(publicKey)
    .cursor('now')
    .stream({
      onmessage: (payment) => {
        // Forward the payment event to the caller's callback
        onPayment(payment as unknown as Record<string, unknown>);
      },
      onerror: (error) => {
        // Log streaming errors but don't crash — Horizon's EventSource
        // will automatically attempt to reconnect
        console.error(
          `Horizon payment stream error for ${publicKey}:`,
          error
        );
      },
    });

  return closeStream;
}
