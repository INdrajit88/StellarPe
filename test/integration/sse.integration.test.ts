/**
 * Integration tests for SSE notification flow.
 *
 * Tests the real-time notification lifecycle:
 * - SSE connection establishment with correct streaming headers
 * - Payment notification delivery via NotificationService to connected clients
 * - Subscribe/unsubscribe lifecycle management
 * - Multiple subscribers receive only their own notifications
 *
 * The NotificationService is tested directly (not mocked) to exercise the
 * actual SSE connection management and event dispatch logic. The SSE route
 * handler is also tested for HTTP-level behavior.
 *
 * @see Requirements 5.1, 5.3
 */

import { GET } from '../../src/app/api/events/stream/route';
import {
  subscribe,
  unsubscribe,
  notifyPaymentReceived,
  isSubscribed,
  getConnectionCount,
} from '../../src/lib/services/notification.service';

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Builds a GET request to /api/events/stream with auth headers.
 */
function buildSSERequest(options?: {
  userId?: string;
  role?: string;
  omitAuth?: boolean;
}): Request {
  const headers: Record<string, string> = {};

  if (!options?.omitAuth) {
    headers['x-user-id'] = options?.userId ?? 'user-1';
    headers['x-user-role'] = options?.role ?? 'USER';
  }

  return new Request('http://localhost/api/events/stream', {
    method: 'GET',
    headers,
  });
}

/**
 * Reads the first chunk from a ReadableStream and returns decoded text.
 * Cancels the reader after reading to trigger cleanup.
 */
async function readFirstChunk(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const { value } = await reader.read();
  const text = value ? decoder.decode(value, { stream: true }) : '';
  await reader.cancel();
  return text;
}

/**
 * Creates a mock ReadableStreamDefaultController that captures enqueued data.
 * Returns the controller and a function to retrieve all enqueued messages.
 */
function createMockController(): {
  controller: ReadableStreamDefaultController<Uint8Array>;
  getMessages: () => string[];
  isClosed: () => boolean;
} {
  const messages: string[] = [];
  let closed = false;
  const decoder = new TextDecoder();

  const controller = {
    enqueue(chunk: Uint8Array) {
      messages.push(decoder.decode(chunk));
    },
    close() {
      closed = true;
    },
    error() {
      closed = true;
    },
    desiredSize: 1,
  } as unknown as ReadableStreamDefaultController<Uint8Array>;

  return {
    controller,
    getMessages: () => messages,
    isClosed: () => closed,
  };
}

// ── Test Suite ───────────────────────────────────────────────────────────

describe('SSE Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clean up any lingering SSE connections between tests
    // by unsubscribing known test user IDs
    for (const userId of ['user-1', 'user-2', 'user-3', 'user-sse-1', 'user-sse-2', 'recipient-1', 'recipient-2', 'other-user']) {
      try { unsubscribe(userId); } catch { /* ignore */ }
    }
  });

  // ── SSE Connection Establishment ────────────────────────────────────

  describe('SSE connection establishment', () => {
    it('returns a streaming response with correct SSE headers', async () => {
      const request = buildSSERequest({ userId: 'user-sse-1' });
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
      expect(response.headers.get('Cache-Control')).toBe('no-cache');
      expect(response.headers.get('Connection')).toBe('keep-alive');

      // Clean up the stream
      const reader = response.body!.getReader();
      await reader.read();
      await reader.cancel();
    });

    it('sends an initial "connected" event with userId and timestamp', async () => {
      const request = buildSSERequest({ userId: 'user-sse-1' });
      const response = await GET(request);

      const content = await readFirstChunk(response);

      expect(content).toContain('event: connected');
      expect(content).toContain('"userId":"user-sse-1"');
      expect(content).toContain('"timestamp"');
    });

    it('returns a ReadableStream body for streaming', async () => {
      const request = buildSSERequest({ userId: 'user-sse-1' });
      const response = await GET(request);

      expect(response.body).toBeInstanceOf(ReadableStream);

      // Clean up
      const reader = response.body!.getReader();
      await reader.read();
      await reader.cancel();
    });

    it('allows MERCHANT role to connect', async () => {
      const request = buildSSERequest({ userId: 'user-sse-1', role: 'MERCHANT' });
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');

      // Clean up
      const reader = response.body!.getReader();
      await reader.read();
      await reader.cancel();
    });

    it('rejects ADMIN role with 403', async () => {
      const request = buildSSERequest({ userId: 'user-sse-1', role: 'ADMIN' });
      const response = await GET(request);

      expect(response.status).toBe(403);
    });
  });

  // ── Payment Notification Delivery ───────────────────────────────────

  describe('Payment notification delivery via NotificationService', () => {
    it('delivers a payment_received event to a connected client', async () => {
      // Set up a mock controller to capture SSE messages
      const { controller, getMessages } = createMockController();

      // Subscribe the user directly via NotificationService
      subscribe('recipient-1', controller);

      // Simulate an inbound payment notification
      notifyPaymentReceived('recipient-1', {
        id: 'tx-sse-1',
        senderAddress: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV',
        amount: '100.0000000',
        memo: 'Payment for services',
        createdAt: new Date('2024-01-15T10:30:00Z'),
      });

      // Verify the SSE message was delivered
      const messages = getMessages();
      expect(messages.length).toBe(1);

      const message = messages[0];
      expect(message).toContain('event: payment_received');
      expect(message).toContain('"type":"payment_received"');
      expect(message).toContain('"transactionId":"tx-sse-1"');
      expect(message).toContain('"senderAddress":"GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV"');
      expect(message).toContain('"amount":"100.0000000"');
      expect(message).toContain('"memo":"Payment for services"');
      expect(message).toContain('"timestamp":"2024-01-15T10:30:00.000Z"');

      // Verify SSE format: "event: <type>\ndata: <json>\n\n"
      expect(message).toMatch(/^event: payment_received\ndata: \{.*\}\n\n$/);

      // Clean up
      unsubscribe('recipient-1');
    });

    it('silently drops notification when user has no active SSE connection', async () => {
      // No subscription for this user — should not throw
      expect(() => {
        notifyPaymentReceived('nonexistent-user', {
          id: 'tx-dropped-1',
          senderAddress: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV',
          amount: '50',
        });
      }).not.toThrow();
    });

    it('delivers multiple payment events in sequence to the same client', async () => {
      const { controller, getMessages } = createMockController();
      subscribe('recipient-1', controller);

      // Send two payment notifications
      notifyPaymentReceived('recipient-1', {
        id: 'tx-multi-1',
        senderAddress: 'GSENDER1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        amount: '25',
      });

      notifyPaymentReceived('recipient-1', {
        id: 'tx-multi-2',
        senderAddress: 'GSENDER2BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        amount: '75',
        memo: 'Second payment',
      });

      const messages = getMessages();
      expect(messages.length).toBe(2);
      expect(messages[0]).toContain('"transactionId":"tx-multi-1"');
      expect(messages[1]).toContain('"transactionId":"tx-multi-2"');

      // Clean up
      unsubscribe('recipient-1');
    });

    it('includes a timestamp in the notification even when createdAt is not provided', async () => {
      const { controller, getMessages } = createMockController();
      subscribe('recipient-1', controller);

      notifyPaymentReceived('recipient-1', {
        id: 'tx-no-date',
        senderAddress: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV',
        amount: '10',
      });

      const messages = getMessages();
      expect(messages.length).toBe(1);

      // Parse the data payload to verify timestamp is present
      const dataLine = messages[0].split('\n').find(l => l.startsWith('data: '));
      const payload = JSON.parse(dataLine!.replace('data: ', ''));
      expect(payload.timestamp).toBeDefined();
      expect(new Date(payload.timestamp).getTime()).not.toBeNaN();

      // Clean up
      unsubscribe('recipient-1');
    });
  });

  // ── Subscribe/Unsubscribe Lifecycle ─────────────────────────────────

  describe('Subscribe/unsubscribe lifecycle', () => {
    it('registers a connection on subscribe and removes it on unsubscribe', () => {
      const { controller } = createMockController();

      // Initially not subscribed
      expect(isSubscribed('user-1')).toBe(false);

      // Subscribe
      subscribe('user-1', controller);
      expect(isSubscribed('user-1')).toBe(true);

      // Unsubscribe
      unsubscribe('user-1');
      expect(isSubscribed('user-1')).toBe(false);
    });

    it('replaces existing connection when same user subscribes again', () => {
      const mock1 = createMockController();
      const mock2 = createMockController();

      subscribe('user-1', mock1.controller);
      expect(isSubscribed('user-1')).toBe(true);

      // Subscribe again with a new controller — old one should be replaced
      subscribe('user-1', mock2.controller);
      expect(isSubscribed('user-1')).toBe(true);

      // Sending a notification should go to the new controller only
      notifyPaymentReceived('user-1', {
        id: 'tx-replace-1',
        senderAddress: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV',
        amount: '10',
      });

      expect(mock1.getMessages().length).toBe(0);
      expect(mock2.getMessages().length).toBe(1);

      // Clean up
      unsubscribe('user-1');
    });

    it('unsubscribe is idempotent for non-existent users', () => {
      expect(() => {
        unsubscribe('never-subscribed-user');
      }).not.toThrow();
    });

    it('tracks connection count correctly across subscribe/unsubscribe', () => {
      const mock1 = createMockController();
      const mock2 = createMockController();

      const initialCount = getConnectionCount();

      subscribe('user-1', mock1.controller);
      expect(getConnectionCount()).toBe(initialCount + 1);

      subscribe('user-2', mock2.controller);
      expect(getConnectionCount()).toBe(initialCount + 2);

      unsubscribe('user-1');
      expect(getConnectionCount()).toBe(initialCount + 1);

      unsubscribe('user-2');
      expect(getConnectionCount()).toBe(initialCount);
    });

    it('unsubscribes when SSE stream is cancelled via route handler', async () => {
      const request = buildSSERequest({ userId: 'user-sse-2' });
      const response = await GET(request);

      // Read the initial chunk to trigger the start callback (which calls subscribe)
      const reader = response.body!.getReader();
      await reader.read();

      // The user should now be subscribed
      expect(isSubscribed('user-sse-2')).toBe(true);

      // Cancel the stream — triggers the cancel callback (which calls unsubscribe)
      await reader.cancel();

      // The user should now be unsubscribed
      expect(isSubscribed('user-sse-2')).toBe(false);
    });
  });

  // ── Multiple Subscribers ────────────────────────────────────────────

  describe('Multiple subscribers receive only their own notifications', () => {
    it('delivers notification only to the targeted recipient', () => {
      const mockRecipient1 = createMockController();
      const mockRecipient2 = createMockController();
      const mockOther = createMockController();

      subscribe('recipient-1', mockRecipient1.controller);
      subscribe('recipient-2', mockRecipient2.controller);
      subscribe('other-user', mockOther.controller);

      // Send notification only to recipient-1
      notifyPaymentReceived('recipient-1', {
        id: 'tx-targeted-1',
        senderAddress: 'GSENDERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        amount: '200',
        memo: 'For recipient 1 only',
      });

      // Only recipient-1 should have received the message
      expect(mockRecipient1.getMessages().length).toBe(1);
      expect(mockRecipient1.getMessages()[0]).toContain('"transactionId":"tx-targeted-1"');

      // Others should have received nothing
      expect(mockRecipient2.getMessages().length).toBe(0);
      expect(mockOther.getMessages().length).toBe(0);

      // Clean up
      unsubscribe('recipient-1');
      unsubscribe('recipient-2');
      unsubscribe('other-user');
    });

    it('delivers separate notifications to different recipients independently', () => {
      const mockRecipient1 = createMockController();
      const mockRecipient2 = createMockController();

      subscribe('recipient-1', mockRecipient1.controller);
      subscribe('recipient-2', mockRecipient2.controller);

      // Send different notifications to each recipient
      notifyPaymentReceived('recipient-1', {
        id: 'tx-r1',
        senderAddress: 'GSENDERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        amount: '100',
      });

      notifyPaymentReceived('recipient-2', {
        id: 'tx-r2',
        senderAddress: 'GSENDERBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        amount: '200',
      });

      // Each recipient should have received exactly their own notification
      expect(mockRecipient1.getMessages().length).toBe(1);
      expect(mockRecipient1.getMessages()[0]).toContain('"transactionId":"tx-r1"');
      expect(mockRecipient1.getMessages()[0]).toContain('"amount":"100"');

      expect(mockRecipient2.getMessages().length).toBe(1);
      expect(mockRecipient2.getMessages()[0]).toContain('"transactionId":"tx-r2"');
      expect(mockRecipient2.getMessages()[0]).toContain('"amount":"200"');

      // Clean up
      unsubscribe('recipient-1');
      unsubscribe('recipient-2');
    });

    it('does not affect other subscribers when one unsubscribes', () => {
      const mockRecipient1 = createMockController();
      const mockRecipient2 = createMockController();

      subscribe('recipient-1', mockRecipient1.controller);
      subscribe('recipient-2', mockRecipient2.controller);

      // Unsubscribe recipient-1
      unsubscribe('recipient-1');

      // recipient-2 should still be subscribed and receive notifications
      expect(isSubscribed('recipient-2')).toBe(true);

      notifyPaymentReceived('recipient-2', {
        id: 'tx-after-unsub',
        senderAddress: 'GSENDERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        amount: '50',
      });

      expect(mockRecipient2.getMessages().length).toBe(1);
      expect(mockRecipient2.getMessages()[0]).toContain('"transactionId":"tx-after-unsub"');

      // Notification to unsubscribed user should be silently dropped
      expect(() => {
        notifyPaymentReceived('recipient-1', {
          id: 'tx-dropped',
          senderAddress: 'GSENDERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          amount: '10',
        });
      }).not.toThrow();

      // Clean up
      unsubscribe('recipient-2');
    });
  });
});
