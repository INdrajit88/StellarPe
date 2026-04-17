/**
 * POST /api/payments/send — Send a payment with PIN authorization.
 *
 * Requires JWT authentication (handled by Edge middleware). Accessible
 * only by the USER role. Validates the request body with Zod, checks
 * the payment rate limit, validates CSRF, and delegates to
 * PaymentService.sendPayment for the full payment flow.
 *
 * Middleware stack:
 * 1. JWT auth (Edge middleware — x-user-id / x-user-role headers)
 * 2. CSRF validation (POST is state-mutating)
 * 3. Role guard (USER only)
 * 4. Rate limiter (payment — 20 req/user/min)
 * 5. Zod validation (sendPaymentSchema)
 *
 * Error mapping:
 * - 400: Validation failure, insufficient balance, incorrect PIN, PIN required
 * - 403: CSRF missing or role not authorized
 * - 423: Account locked (too many failed PIN attempts)
 * - 429: Rate limit exceeded
 * - 500: Unexpected server error
 * - 502: Stellar submission failed
 *
 * @see Requirements 3.1–3.10 (send payment flow),
 *      13.2 (payment rate limit), 13.7 (CSRF)
 */

import { sendPayment, PaymentError } from '@/lib/services/payment.service';
import { sendPaymentSchema } from '@/lib/validators/payment.validator';
import { validateRequest } from '@/lib/middleware/validator';
import { requireRole } from '@/lib/middleware/role-guard';
import { paymentRateLimiter } from '@/lib/middleware/rate-limiter';
import { validateCsrf } from '@/lib/middleware/csrf';

export async function POST(request: Request) {
  try {
    // Step 1: CSRF validation — POST is a state-mutating method.
    const csrfError = validateCsrf(request);
    if (csrfError) {
      return csrfError;
    }

    // Step 2: Extract auth context from Edge middleware headers.
    const userId = request.headers.get('x-user-id');
    const userRole = request.headers.get('x-user-role');

    // Step 3: Role guard — only USER can send payments.
    const roleGuard = requireRole('USER');
    const roleError = roleGuard(userRole);
    if (roleError) {
      return roleError;
    }

    // Step 4: Rate limit check by user ID.
    const rateLimitResult = paymentRateLimiter.check(userId!);

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

    // Step 5: Parse and validate the request body with Zod.
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { error: 'Invalid JSON in request body.' },
        { status: 400 },
      );
    }

    const validation = validateRequest(sendPaymentSchema, body);
    if (validation.error) {
      return validation.error;
    }

    // Step 6: Delegate to PaymentService.sendPayment.
    const result = await sendPayment({
      senderId: userId!,
      recipient: validation.data.recipient,
      amount: String(validation.data.amount),
      pin: validation.data.pin,
      memo: validation.data.memo,
    });

    // Step 7: Return success response with transaction details.
    return Response.json(
      {
        transaction: result.transaction,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    // Handle known PaymentError instances with their status codes.
    if (error instanceof PaymentError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.statusCode },
      );
    }

    // Unexpected error — do not leak internal details.
    console.error('Send payment error:', error);
    return Response.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 },
    );
  }
}
