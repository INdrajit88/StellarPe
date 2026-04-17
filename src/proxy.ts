/**
 * Next.js Edge Middleware — JWT authentication for API routes.
 *
 * Runs on the Edge runtime for all `/api/*` routes except `/api/auth/*`.
 * Since the Edge runtime cannot use Node.js-only packages like `jsonwebtoken`,
 * this middleware performs lightweight JWT decoding (base64url parsing) and
 * forwards the decoded claims as custom request headers (`x-user-id`, `x-user-role`)
 * to downstream API route handlers. The route handlers are responsible for
 * full JWT verification using `validateToken` from AuthService.
 *
 * Flow:
 * 1. Skip non-API and auth routes (let them pass through)
 * 2. Extract Bearer token from the Authorization header
 * 3. Decode the JWT payload (base64url) without cryptographic verification
 * 4. Attach `x-user-id` and `x-user-role` headers to the request
 * 5. Forward the modified request upstream
 *
 * SECURITY NOTE: The Edge middleware only decodes the JWT — it does NOT verify
 * the signature. Full verification (signature + expiry + session validity) MUST
 * be performed in each API route handler using `validateToken` or
 * `validateTokenWithSession` from `@/lib/services/auth.service`.
 *
 * @see Requirements 1.6 (expired/absent JWT rejected with 401)
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * Decodes a base64url-encoded string to a UTF-8 string.
 */
function base64UrlDecode(input: string): string {
  // Replace URL-safe characters with standard Base64 characters.
  let base64 = input.replace(/-/g, '+').replace(/_/g, '/');

  // Pad to a multiple of 4 characters.
  const padding = base64.length % 4;
  if (padding) {
    base64 += '='.repeat(4 - padding);
  }

  // atob is available in the Edge runtime.
  return atob(base64);
}

/**
 * Decodes a JWT payload without verifying the signature.
 * Returns the parsed claims or null if decoding fails.
 */
function decodeJwtPayload(token: string): { userId?: string; role?: string; exp?: number } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payloadJson = base64UrlDecode(parts[1]);
    const payload = JSON.parse(payloadJson);
    return payload;
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Only intercept /api/* routes, excluding /api/auth/*.
  if (!pathname.startsWith('/api/') || pathname.startsWith('/api/auth/')) {
    return NextResponse.next();
  }

  // Extract the Bearer token from the Authorization header.
  const authHeader = request.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Authentication required. Please provide a valid Bearer token.' },
      { status: 401 },
    );
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix.

  if (!token) {
    return NextResponse.json(
      { error: 'Authentication required. Please provide a valid Bearer token.' },
      { status: 401 },
    );
  }

  // Decode the JWT payload (no signature verification at Edge).
  const payload = decodeJwtPayload(token);

  if (!payload || !payload.userId || !payload.role) {
    return NextResponse.json(
      { error: 'Invalid token.' },
      { status: 401 },
    );
  }

  // Check if the token has expired (exp is in seconds since epoch).
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    return NextResponse.json(
      { error: 'Token has expired.' },
      { status: 401 },
    );
  }

  // Forward userId and role as custom headers to the API route handler.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-user-id', payload.userId);
  requestHeaders.set('x-user-role', payload.role);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

/**
 * Matcher: apply this middleware only to /api/* routes.
 */
export const config = {
  matcher: '/api/:path*',
};
