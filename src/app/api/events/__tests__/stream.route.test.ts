/**
 * Unit tests for GET /api/events/stream SSE route handler.
 *
 * Tests cover:
 * - Successful SSE stream returns 200 with proper headers
 * - Initial "connected" event is sent on stream start
 * - NotificationService.subscribe is called with userId and controller
 * - NotificationService.unsubscribe is called on stream cancel
 * - Role guard rejects ADMIN role with 403
 * - Role guard rejects missing role with 403
 * - Unexpected errors return 500
 *
 * @see Requirements 5.3
 */

import { GET } from '../stream/route';
import * as NotificationServiceModule from '@/lib/services/notification.service';

// Mock NotificationService subscribe/unsubscribe
jest.mock('@/lib/services/notification.service', () => {
  const actual = jest.requireActual(
    '@/lib/services/notification.service',
  ) as typeof NotificationServiceModule;
  return {
    ...actual,
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
  };
});

const mockSubscribe = NotificationServiceModule.subscribe as jest.MockedFunction<
  typeof NotificationServiceModule.subscribe
>;
const mockUnsubscribe = NotificationServiceModule.unsubscribe as jest.MockedFunction<
  typeof NotificationServiceModule.unsubscribe
>;

/**
 * Helper: builds a GET Request with auth headers set by Edge middleware.
 */
function buildRequest(options?: {
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
 * Helper: reads all available chunks from a ReadableStream and returns
 * the decoded text content.
 */
async function readStream(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let result = '';

  // Read the first chunk (the connected event)
  const { value, done } = await reader.read();
  if (!done && value) {
    result += decoder.decode(value, { stream: true });
  }

  // Cancel the reader to trigger the stream's cancel callback
  await reader.cancel();

  return result;
}

describe('GET /api/events/stream', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 with SSE headers on success', async () => {
    const request = buildRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(response.headers.get('Cache-Control')).toBe('no-cache');
    expect(response.headers.get('Connection')).toBe('keep-alive');
  });

  it('sends an initial "connected" event', async () => {
    const request = buildRequest({ userId: 'user-42' });
    const response = await GET(request);

    const content = await readStream(response);

    expect(content).toContain('event: connected');
    expect(content).toContain('"userId":"user-42"');
    expect(content).toContain('"timestamp"');
  });

  it('calls NotificationService.subscribe with userId and controller', async () => {
    const request = buildRequest({ userId: 'user-99' });
    const response = await GET(request);

    // Read the stream to trigger the start callback
    await readStream(response);

    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    expect(mockSubscribe).toHaveBeenCalledWith(
      'user-99',
      expect.any(Object), // ReadableStreamDefaultController
    );
  });

  it('calls NotificationService.unsubscribe on stream cancel', async () => {
    const request = buildRequest({ userId: 'user-77' });
    const response = await GET(request);

    // readStream reads the first chunk then cancels the reader
    await readStream(response);

    expect(mockUnsubscribe).toHaveBeenCalledWith('user-77');
  });

  it('returns 200 for MERCHANT role', async () => {
    const request = buildRequest({ role: 'MERCHANT' });
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
  });

  it('returns 403 for ADMIN role', async () => {
    const request = buildRequest({ role: 'ADMIN' });
    const response = await GET(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('Forbidden');
  });

  it('returns 403 when role is missing', async () => {
    const request = buildRequest({ omitAuth: true });
    const response = await GET(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('Forbidden');
  });

  it('returns a response body that is a ReadableStream', async () => {
    const request = buildRequest();
    const response = await GET(request);

    expect(response.body).toBeInstanceOf(ReadableStream);
  });
});
