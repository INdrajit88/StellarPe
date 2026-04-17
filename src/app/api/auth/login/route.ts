/**
 * POST /api/auth/login — User/Merchant login endpoint.
 *
 * Accepts a JSON payload with email and password.
 * Validates the input with Zod, checks the auth rate limit, validates CSRF,
 * and delegates to AuthService.login for credential verification and JWT
 * issuance.
 *
 * Returns a signed JWT and user data on success.
 *
 * Error mapping:
 * - 400: Invalid JSON body
 * - 401: Invalid credentials (generic — never reveals which field is wrong)
 * - 403: CSRF token missing
 * - 423: Account locked due to too many failed attempts
 * - 429: Rate limit exceeded
 * - 500: Unexpected server error
 *
 * @see Requirements 1.4 (JWT ≤ 24h), 1.5 (generic invalid credentials),
 *      13.1 (auth rate limit), 13.5 (login lockout after 5 failures)
 */

import { login } from '@/lib/services/auth.service';
import { AuthError, AuthErrorCode } from '@/lib/services/auth.service';
import { loginSchema } from '@/lib/validators/auth.validator';
import { validateRequest } from '@/lib/middleware/validator';
import { authRateLimiter } from '@/lib/middleware/rate-limiter';
import { validateCsrf } from '@/lib/middleware/csrf';

/**
 * Extracts the client IP address from the request headers.
 * Checks x-forwarded-for first, then x-real-ip, with a fallback.
 */
function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  return 'unknown';
}

/**
 * Maps AuthError codes to appropriate HTTP status codes.
 */
function mapAuthErrorToStatus(code: string): number {
  switch (code) {
    case AuthErrorCode.DUPLICATE_USERNAME:
    case AuthErrorCode.DUPLICATE_EMAIL:
      return 409;
    case AuthErrorCode.VALIDATION_ERROR:
      return 400;
    case AuthErrorCode.INVALID_CREDENTIALS:
      return 401;
    case AuthErrorCode.ACCOUNT_LOCKED:
      return 423;
    case AuthErrorCode.ACCOUNT_INACTIVE:
      return 401;
    case AuthErrorCode.INVALID_TOKEN:
      return 401;
    default:
      return 400;
  }
}

export async function POST(request: Request) {
  try {
    // Step 1: CSRF validation — POST is a state-mutating method.
    const csrfError = validateCsrf(request);
    if (csrfError) {
      return csrfError;
    }

    // Step 2: Rate limit check by client IP.
    const clientIp = getClientIp(request);
    const rateLimitResult = authRateLimiter.check(clientIp);

    if (!rateLimitResult.allowed) {
      return Response.json(
        {
          error: 'Too many requests. Please try again later.',
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000)),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(rateLimitResult.resetAt),
          },
        },
      );
    }

    // Step 3: Parse and validate the request body with Zod.
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { error: 'Invalid JSON in request body.' },
        { status: 400 },
      );
    }

    const validation = validateRequest(loginSchema, body);
    if (validation.error) {
      return validation.error;
    }

    // Step 4: Delegate to AuthService.login.
    const result = await login(validation.data);

    // Step 5: Return success response with JWT and user data.
    return Response.json(
      {
        token: result.token,
        user: result.user,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    // Handle known AuthError instances.
    if (error instanceof AuthError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: mapAuthErrorToStatus(error.code) },
      );
    }

    // Unexpected error — do not leak internal details.
    console.error('Login error:', error);
    return Response.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 },
    );
  }
}
