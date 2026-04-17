/**
 * GET /api/events/stream — SSE endpoint for real-time payment notifications.
 *
 * Requires JWT authentication (handled by Edge middleware which sets
 * x-user-id and x-user-role headers). Accessible by USER and MERCHANT roles.
 *
 * Opens a Server-Sent Events (SSE) stream using a ReadableStream.
 * The stream:
 * 1. Registers the user with NotificationService.subscribe(userId, controller)
 * 2. Sends an initial "connected" event
 * 3. Unsubscribes on stream close/cancel via NotificationService.unsubscribe(userId)
 *
 * SSE headers:
 * - Content-Type: text/event-stream
 * - Cache-Control: no-cache
 * - Connection: keep-alive
 *
 * Error mapping:
 * - 403: Role not authorized
 * - 500: Unexpected server error
 *
 * @see Requirements 5.3 (push SSE notifications to active browser session)
 */

import { requireRole } from '@/lib/middleware/role-guard';
import { subscribe, unsubscribe } from '@/lib/services/notification.service';

export async function GET(request: Request) {
  try {
    // Step 1: Extract auth context from Edge middleware headers.
    const userId = request.headers.get('x-user-id');
    const userRole = request.headers.get('x-user-role');

    // Step 2: Role guard — only USER and MERCHANT can subscribe to events.
    const roleGuard = requireRole('USER', 'MERCHANT');
    const roleError = roleGuard(userRole);
    if (roleError) {
      return roleError;
    }

    // Step 3: Create a ReadableStream for SSE.
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        // Register this user's SSE connection with the NotificationService.
        subscribe(userId!, controller);

        // Send an initial "connected" event so the client knows the stream is live.
        const connectedEvent = `event: connected\ndata: ${JSON.stringify({ userId, timestamp: new Date().toISOString() })}\n\n`;
        controller.enqueue(encoder.encode(connectedEvent));
      },
      cancel() {
        // Clean up when the client disconnects or the stream is cancelled.
        unsubscribe(userId!);
      },
    });

    // Step 4: Return the SSE response with proper headers.
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: unknown) {
    // Unexpected error — do not leak internal details.
    console.error('SSE stream error:', error);
    return Response.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 },
    );
  }
}
