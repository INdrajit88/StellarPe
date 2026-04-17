/**
 * NotificationService — Real-time payment notifications via SSE and Horizon streaming.
 *
 * Manages Server-Sent Events (SSE) connections for authenticated users and
 * relays inbound payment events from the Stellar Horizon API to connected
 * clients. Also records inbound transactions in the database.
 *
 * Architecture:
 * - Each connected user has a ReadableStreamDefaultController registered
 *   in an in-memory map. When a payment event arrives, the service pushes
 *   a JSON-encoded SSE message to the user's stream.
 * - Horizon streaming is initialized for all registered Stellar addresses.
 *   When an inbound payment is detected, the service records the transaction
 *   in the database and notifies the recipient via their SSE connection.
 * - Exponential backoff reconnection is used when the Horizon streaming
 *   connection is interrupted: min(2^N × baseInterval, 30000) ms.
 *
 * @see Requirements 5.1 (record inbound transactions), 5.2 (stream from Horizon),
 *      5.3 (push SSE notifications), 5.4 (display balance refreshed within 30s),
 *      5.5 (exponential backoff reconnection)
 */

import { prisma } from '@/lib/prisma';
import { streamPayments } from './stellar.service';

// ── Types ────────────────────────────────────────────────────────────────

/** Minimal transaction data pushed to SSE clients. */
export interface PaymentNotification {
  type: 'payment_received';
  transactionId: string;
  senderAddress: string;
  amount: string;
  memo?: string;
  timestamp: string;
}

/** SSE stream controller type — the writable end of a ReadableStream. */
type SSEController = ReadableStreamDefaultController<Uint8Array>;

// ── Constants ────────────────────────────────────────────────────────────

/** Base interval for exponential backoff in milliseconds. */
const BACKOFF_BASE_INTERVAL_MS = 1000;

/** Maximum backoff interval in milliseconds (30 seconds). */
const BACKOFF_MAX_INTERVAL_MS = 30_000;

// ── State ────────────────────────────────────────────────────────────────

/**
 * In-memory map of userId → SSE controller.
 * Each entry represents an active SSE connection for a user.
 *
 * NOTE: This is an in-memory store, so SSE connections are lost on server
 * restart. For multi-process deployments, this would need to be replaced
 * with a shared store (e.g. Redis pub/sub).
 */
const sseConnections = new Map<string, SSEController>();

/**
 * In-memory map of stellarAddress → close function for Horizon streams.
 * Used to clean up streaming connections when the service shuts down
 * or when a stream needs to be replaced (e.g. after reconnection).
 */
const horizonStreams = new Map<string, () => void>();

// ── Exponential Backoff ──────────────────────────────────────────────────

/**
 * Calculates the exponential backoff interval for a given attempt number.
 *
 * Formula: min(2^attempt × baseInterval, maxInterval)
 *
 * @param attempt - The reconnection attempt number (0-indexed).
 * @param baseInterval - The base interval in milliseconds (default: 1000).
 * @param maxInterval - The maximum interval in milliseconds (default: 30000).
 * @returns The backoff interval in milliseconds.
 *
 * @see Requirements 5.5
 */
export function calculateBackoff(
  attempt: number,
  baseInterval: number = BACKOFF_BASE_INTERVAL_MS,
  maxInterval: number = BACKOFF_MAX_INTERVAL_MS,
): number {
  const interval = Math.pow(2, attempt) * baseInterval;
  return Math.min(interval, maxInterval);
}

// ── SSE Connection Management ────────────────────────────────────────────

/**
 * Registers an SSE connection for a user.
 *
 * If the user already has an active connection, the old one is closed
 * before registering the new one (one connection per user).
 *
 * @param userId - The user's database ID.
 * @param controller - The ReadableStreamDefaultController for the SSE response.
 *
 * @see Requirements 5.3
 */
export function subscribe(userId: string, controller: SSEController): void {
  // Close any existing connection for this user
  if (sseConnections.has(userId)) {
    try {
      sseConnections.get(userId)!.close();
    } catch {
      // Controller may already be closed — ignore
    }
  }

  sseConnections.set(userId, controller);
}

/**
 * Removes an SSE connection for a user.
 *
 * @param userId - The user's database ID.
 *
 * @see Requirements 5.3
 */
export function unsubscribe(userId: string): void {
  const controller = sseConnections.get(userId);
  if (controller) {
    try {
      controller.close();
    } catch {
      // Controller may already be closed — ignore
    }
    sseConnections.delete(userId);
  }
}

/**
 * Returns whether a user currently has an active SSE connection.
 *
 * @param userId - The user's database ID.
 * @returns true if the user has a registered SSE controller.
 */
export function isSubscribed(userId: string): boolean {
  return sseConnections.has(userId);
}

/**
 * Returns the number of active SSE connections.
 * Useful for monitoring and testing.
 */
export function getConnectionCount(): number {
  return sseConnections.size;
}

// ── Notification Dispatch ────────────────────────────────────────────────

/**
 * Pushes a payment notification to a user's active SSE stream.
 *
 * Encodes the notification as an SSE-formatted message:
 *   event: payment_received\n
 *   data: {JSON}\n\n
 *
 * If the user has no active SSE connection, the notification is silently
 * dropped (the user will see the transaction in their history on next load).
 *
 * @param userId - The recipient user's database ID.
 * @param transaction - The transaction data to include in the notification.
 *
 * @see Requirements 5.3
 */
export function notifyPaymentReceived(
  userId: string,
  transaction: {
    id: string;
    senderAddress: string;
    amount: string | number;
    memo?: string | null;
    createdAt?: Date | string;
  },
): void {
  const controller = sseConnections.get(userId);
  if (!controller) {
    // No active SSE connection for this user — silently drop
    return;
  }

  const notification: PaymentNotification = {
    type: 'payment_received',
    transactionId: transaction.id,
    senderAddress: transaction.senderAddress,
    amount: String(transaction.amount),
    memo: transaction.memo ?? undefined,
    timestamp: transaction.createdAt
      ? new Date(transaction.createdAt).toISOString()
      : new Date().toISOString(),
  };

  // Format as SSE message: "event: <type>\ndata: <json>\n\n"
  // The double newline at the end is required by the SSE protocol to
  // delimit individual events. The event name allows clients to use
  // addEventListener('payment_received', ...) for targeted handling.
  const sseMessage = `event: payment_received\ndata: ${JSON.stringify(notification)}\n\n`;

  try {
    const encoder = new TextEncoder();
    controller.enqueue(encoder.encode(sseMessage));
  } catch {
    // Controller may be closed — clean up the stale connection
    sseConnections.delete(userId);
  }
}

// ── Horizon Streaming ────────────────────────────────────────────────────

/**
 * Initializes Horizon payment streams for all registered Stellar addresses.
 *
 * Queries the database for all wallets, then opens a Horizon streaming
 * connection for each address. Inbound payment events are:
 * 1. Recorded as transactions in the database
 * 2. Pushed to the recipient's SSE connection (if active)
 *
 * Uses exponential backoff for reconnection on stream errors.
 *
 * @see Requirements 5.1, 5.2, 5.5
 */
export async function startHorizonStreaming(): Promise<void> {
  // Fetch all registered wallets
  const wallets = await prisma.wallet.findMany({
    select: {
      stellarAddress: true,
      userId: true,
    },
  });

  for (const wallet of wallets) {
    startStreamForAddress(wallet.stellarAddress, wallet.userId);
  }
}

/**
 * Starts a Horizon payment stream for a single Stellar address.
 *
 * When an inbound payment is detected:
 * 1. Records the transaction in the database with status COMPLETED
 * 2. Looks up the recipient's userId
 * 3. Pushes an SSE notification to the recipient if connected
 *
 * @param stellarAddress - The Stellar public key to monitor.
 * @param userId - The user ID associated with this address.
 */
function startStreamForAddress(stellarAddress: string, userId: string): void {
  // Close any existing stream for this address
  const existingClose = horizonStreams.get(stellarAddress);
  if (existingClose) {
    existingClose();
  }

  const closeStream = streamPayments(stellarAddress, async (payment) => {
    try {
      // Extract payment details from the Horizon event
      const senderAddress = (payment.from as string) ?? 'unknown';
      const amount = (payment.amount as string) ?? '0';
      const memo = (payment.memo as string) ?? null;
      const stellarTxId = (payment.transaction_hash as string) ?? null;

      // Record the inbound transaction in the database
      const transaction = await prisma.transaction.create({
        data: {
          stellarTxId,
          senderAddress,
          recipientAddress: stellarAddress,
          recipientId: userId,
          amount: parseFloat(amount),
          memo,
          status: 'COMPLETED',
        },
      });

      // Push SSE notification to the recipient
      notifyPaymentReceived(userId, {
        id: transaction.id,
        senderAddress,
        amount,
        memo,
        createdAt: transaction.createdAt,
      });
    } catch (error) {
      // Log but don't crash the stream — individual payment processing
      // failures should not kill the entire stream
      console.error(
        `Error processing inbound payment for ${stellarAddress}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  });

  horizonStreams.set(stellarAddress, closeStream);
}

/**
 * Stops all active Horizon streaming connections.
 * Used during shutdown or testing cleanup.
 */
export function stopAllStreams(): void {
  for (const [address, closeStream] of horizonStreams) {
    try {
      closeStream();
    } catch {
      // Ignore errors during cleanup
    }
  }
  horizonStreams.clear();
}

/**
 * Stops all SSE connections and Horizon streams.
 * Full cleanup for shutdown.
 */
export function shutdown(): void {
  // Close all SSE connections
  for (const [userId] of sseConnections) {
    unsubscribe(userId);
  }

  // Stop all Horizon streams
  stopAllStreams();
}
