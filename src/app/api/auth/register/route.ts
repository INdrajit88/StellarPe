/**
 * POST /api/auth/register — User/Merchant registration endpoint.
 *
 * Accepts a JSON payload with username, email, password, and role.
 * Validates the input with Zod, checks the auth rate limit, validates CSRF,
 * and delegates to AuthService.register for the actual business logic.
 *
 * Returns the created user (sans password) and a signed JWT on success.
 *
 * Error mapping:
 * - 400: Validation failure (missing/invalid fields)
 * - 403: CSRF token missing
 * - 409: Duplicate username or email
 * - 429: Rate limit exceeded
 * - 500: Unexpected server error
 *
 * @see Requirements 1.1 (registration), 1.2 (duplicate rejection),
 *      1.3 (wallet creation), 1.4 (JWT ≤ 24h), 1.7 (missing fields),
 *      13.1 (auth rate limit)
 */

import { register } from '@/lib/services/auth.service';
import { AuthError, AuthErrorCode } from '@/lib/services/auth.service';
import { registrationSchema } from '@/lib/validators/auth.validator';
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
    // x-forwarded-for may contain multiple IPs; the first is the client.
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

    const validation = validateRequest(registrationSchema, body);
    if (validation.error) {
      return validation.error;
    }

    // Step 4: Delegate to AuthService.register.
    const result = await register(validation.data);

    // Step 5: Return success response with JWT and user data.
    return Response.json(
      {
        user: result.user,
        token: result.token,
      },
      { status: 201 },
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
    console.error('Registration error:', error);
    return Response.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 },
    );
  }
}
