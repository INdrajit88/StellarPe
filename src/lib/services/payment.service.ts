/**
 * PaymentService — Send payments, resolve recipients, and query transaction history.
 *
 * Orchestrates the full payment flow:
 * 1. Resolve recipient identifier (username or Stellar address)
 * 2. Check sender balance against amount + 1 XLM reserve
 * 3. Verify PIN and check lockout status
 * 4. Decrypt sender's secret key
 * 5. Sign and submit payment via StellarService
 * 6. Record transaction in the database (completed or failed)
 * 7. Zero the secret key from memory
 *
 * SECURITY:
 * - Plaintext secret keys are held in memory only during signing and zeroed afterwards.
 * - PINs are verified via bcrypt before any secret key decryption.
 * - Balance is checked before submission to avoid unnecessary signing.
 *
 * @see Requirements 3.1–3.10, 8.1–8.7, 9.1–9.4
 */

import { verifyPin, isLocked } from './pin.service';
import { decryptSecretKey, getWalletDetails } from './wallet.service';
import { getBalance, submitPayment } from './stellar.service';
import { prisma } from '@/lib/prisma';

// ── Constants ───────────────────────────────────────────────────────────

/** Stellar minimum reserve in XLM that must remain in the account.
 * Stellar requires every account to hold at least 1 XLM as a base reserve.
 * Payments that would drop the sender below this threshold are rejected
 * before submission to avoid wasting network fees on a doomed transaction.
 * @see Requirement 3.8 */
const MINIMUM_RESERVE_XLM = 1;

/** Default page size for transaction history. */
const DEFAULT_PAGE_SIZE = 20;

/** Regex for a valid Stellar public key: starts with G, 56 characters. */
const STELLAR_ADDRESS_REGEX = /^G[A-Z2-7]{55}$/;

// ── Error codes ─────────────────────────────────────────────────────────

export const PaymentErrorCode = {
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  INCORRECT_PIN: 'INCORRECT_PIN',
  PIN_REQUIRED: 'PIN_REQUIRED',
  INVALID_RECIPIENT: 'INVALID_RECIPIENT',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  STELLAR_SUBMISSION_FAILED: 'STELLAR_SUBMISSION_FAILED',
} as const;

export class PaymentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Checks if a string looks like a Stellar public key address.
 * Stellar public keys are base32-encoded Ed25519 keys: 56 chars starting with 'G'.
 * This is a quick heuristic — full validation happens in the Stellar SDK when
 * the address is used in a transaction.
 */
function isStellarAddress(identifier: string): boolean {
  return identifier.length === 56 && identifier.startsWith('G');
}

/**
 * Best-effort zeroing of a secret key from memory.
 *
 * JavaScript strings are immutable, so we can't overwrite the original string's
 * memory. Instead, we overwrite the holder object's reference so the original
 * string becomes unreachable and eligible for garbage collection. This is a
 * defense-in-depth measure — it reduces the window during which the plaintext
 * key is accessible in the process heap.
 *
 * @see Requirement 3.9 (secret key held in memory only during signing)
 */
function zeroSecretKey(buffer: { value: string }): void {
  buffer.value = '0'.repeat(buffer.value.length);
}

// ── resolveRecipient ────────────────────────────────────────────────────

/**
 * Resolves a recipient identifier to a Stellar address.
 *
 * If the identifier looks like a Stellar address (starts with 'G', 56 chars),
 * it is returned directly. Otherwise, it's treated as a username and looked
 * up in the database via the User → Wallet relationship.
 *
 * @param identifier - A username or Stellar public key.
 * @returns An object with the resolved Stellar address.
 * @throws PaymentError with INVALID_RECIPIENT if the identifier cannot be resolved.
 *
 * @see Requirements 3.1, 3.2, 9.2, 9.3
 */
export async function resolveRecipient(
  identifier: string,
): Promise<{ stellarAddress: string }> {
  // If it looks like a Stellar address, return it directly
  if (isStellarAddress(identifier)) {
    return { stellarAddress: identifier };
  }

  // Otherwise, treat as a username and look up in the database
  const user = await prisma.user.findUnique({
    where: { username: identifier },
    select: {
      wallet: {
        select: { stellarAddress: true },
      },
    },
  });

  if (!user || !user.wallet) {
    throw new PaymentError(
      `Recipient "${identifier}" not found.`,
      PaymentErrorCode.INVALID_RECIPIENT,
      404,
    );
  }

  return { stellarAddress: user.wallet.stellarAddress };
}

// ── sendPayment ─────────────────────────────────────────────────────────

/**
 * Executes the full payment flow.
 *
 * Steps:
 * 1. Resolve recipient (username → Stellar address or validate direct address)
 * 2. Get sender wallet details (stellarAddress)
 * 3. Check sender balance ≥ amount + 1 XLM reserve
 * 4. Check PIN lockout via isLocked(userId)
 * 5. Verify PIN via verifyPin(userId, pin)
 * 6. Decrypt sender secret key via decryptSecretKey(userId)
 * 7. Submit payment via submitPayment(secretKey, recipientAddress, amount, memo)
 * 8. Record transaction in DB (COMPLETED or FAILED)
 * 9. Zero secret key from memory
 *
 * @param data - Payment request: { senderId, recipient, amount, pin, memo? }
 * @returns An object with the recorded transaction.
 * @throws PaymentError for validation failures (balance, PIN, recipient).
 *
 * @see Requirements 3.1–3.10
 */
export async function sendPayment(data: {
  senderId: string;
  recipient: string;
  amount: string;
  pin: string;
  memo?: string;
}): Promise<{ transaction: Record<string, unknown> }> {
  const { senderId, recipient, amount, pin, memo } = data;

  // Validate PIN is provided
  if (!pin) {
    throw new PaymentError(
      'Transaction PIN is required.',
      PaymentErrorCode.PIN_REQUIRED,
      400,
    );
  }

  // Step 1: Resolve recipient to a Stellar address
  const { stellarAddress: recipientAddress } = await resolveRecipient(recipient);

  // Step 2: Get sender wallet details
  const senderWallet = await getWalletDetails(senderId);
  const senderAddress = senderWallet.stellarAddress;

  // Step 3: Check sender balance ≥ amount + 1 XLM reserve
  const balance = parseFloat(senderWallet.balance);
  const paymentAmount = parseFloat(amount);

  if (balance < paymentAmount + MINIMUM_RESERVE_XLM) {
    throw new PaymentError(
      `Insufficient balance. Available: ${balance} XLM, Required: ${paymentAmount + MINIMUM_RESERVE_XLM} XLM (including 1 XLM reserve).`,
      PaymentErrorCode.INSUFFICIENT_BALANCE,
      400,
    );
  }

  // Step 4: Check PIN lockout
  const locked = await isLocked(senderId);
  if (locked) {
    throw new PaymentError(
      'Account is temporarily locked due to too many failed PIN attempts. Please try again later.',
      PaymentErrorCode.ACCOUNT_LOCKED,
      423,
    );
  }

  // Step 5: Verify PIN
  const pinValid = await verifyPin(senderId, pin);
  if (!pinValid) {
    throw new PaymentError(
      'Incorrect transaction PIN.',
      PaymentErrorCode.INCORRECT_PIN,
      400,
    );
  }

  // Step 6: Decrypt sender secret key
  const secretKeyHolder = { value: await decryptSecretKey(senderId) };

  // Look up the recipient's userId (may be null if external)
  const recipientUser = await prisma.wallet.findUnique({
    where: { stellarAddress: recipientAddress },
    select: { userId: true },
  });

  try {
    // Step 7: Submit payment via StellarService
    const result = await submitPayment(
      secretKeyHolder.value,
      recipientAddress,
      amount,
      memo,
    );

    // Step 8a: Record successful transaction
    const transaction = await prisma.transaction.create({
      data: {
        stellarTxId: result.transactionId,
        senderAddress,
        recipientAddress,
        senderId,
        recipientId: recipientUser?.userId ?? null,
        amount: parseFloat(amount),
        memo: memo ?? null,
        status: 'COMPLETED',
      },
    });

    return { transaction: transaction as unknown as Record<string, unknown> };
  } catch (error: unknown) {
    // Step 8b: Record failed transaction
    const errorMessage = error instanceof Error ? error.message : String(error);

    const transaction = await prisma.transaction.create({
      data: {
        senderAddress,
        recipientAddress,
        senderId,
        recipientId: recipientUser?.userId ?? null,
        amount: parseFloat(amount),
        memo: memo ?? null,
        status: 'FAILED',
        errorReason: errorMessage,
      },
    });

    throw new PaymentError(
      `Payment failed: ${errorMessage}`,
      PaymentErrorCode.STELLAR_SUBMISSION_FAILED,
      502,
    );
  } finally {
    // Step 9: Zero secret key from memory
    zeroSecretKey(secretKeyHolder);
  }
}

// ── getTransactionHistory ───────────────────────────────────────────────

/**
 * Returns a paginated, filtered list of transactions for a user.
 *
 * Queries transactions where the user is either the sender or recipient.
 * Supports conjunctive filtering by date range, direction, and status.
 * Default page size is 20 records.
 *
 * @param userId - The user's database ID.
 * @param filters - Optional filters: page, pageSize, startDate, endDate, direction, status.
 * @returns An object with the transaction list and pagination metadata.
 *
 * @see Requirements 8.1–8.7, 9.1–9.4
 */
export async function getTransactionHistory(
  userId: string,
  filters: {
    page?: number;
    pageSize?: number;
    startDate?: string;
    endDate?: string;
    direction?: 'sent' | 'received';
    status?: 'COMPLETED' | 'FAILED';
  } = {},
): Promise<{
  transactions: Record<string, unknown>[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const skip = (page - 1) * pageSize;

  // Build the where clause — all filters applied conjunctively
  const where: Record<string, unknown> = {};

  // Direction filter: sent = user is sender, received = user is recipient.
  // When no direction is specified, we use an OR clause to include both.
  // All filters are applied conjunctively (AND) per Requirement 8.5.
  if (filters.direction === 'sent') {
    where.senderId = userId;
  } else if (filters.direction === 'received') {
    where.recipientId = userId;
  } else {
    // No direction filter: return both sent and received
    where.OR = [{ senderId: userId }, { recipientId: userId }];
  }

  // Date range filter
  if (filters.startDate || filters.endDate) {
    const createdAt: Record<string, Date> = {};
    if (filters.startDate) {
      createdAt.gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      createdAt.lte = new Date(filters.endDate);
    }
    where.createdAt = createdAt;
  }

  // Status filter
  if (filters.status) {
    where.status = filters.status;
  }

  // Execute query with pagination
  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
      select: {
        id: true,
        stellarTxId: true,
        senderAddress: true,
        recipientAddress: true,
        senderId: true,
        recipientId: true,
        amount: true,
        memo: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  return {
    transactions: transactions as unknown as Record<string, unknown>[],
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}
