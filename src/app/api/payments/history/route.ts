/**
 * GET /api/payments/history — Transaction history with pagination and filters.
 *
 * Requires JWT authentication (handled by Edge middleware). Accessible
 * by USER and MERCHANT roles. Parses query parameters for optional filters
 * (date range, direction, status, page) and validates them with Zod.
 *
 * Middleware stack:
 * 1. JWT auth (Edge middleware — x-user-id / x-user-role headers)
 * 2. Role guard (USER, MERCHANT)
 * 3. Rate limiter (payment — 20 req/user/min)
 * 4. Zod validation (historyFilterSchema on query params)
 *
 * Returns a paginated list of transactions with all required fields.
 *
 * Error mapping:
 * - 400: Invalid filter parameters
 * - 403: Role not authorized
 * - 429: Rate limit exceeded
 * - 500: Unexpected server error
 *
 * @see Requirements 8.1–8.7 (transaction history with filters and pagination)
 */

import { getTransactionHistory } from '@/lib/services/payment.service';
import { historyFilterSchema } from '@/lib/validators/payment.validator';
import { validateRequest } from '@/lib/middleware/validator';
import { requireRole } from '@/lib/middleware/role-guard';
import { paymentRateLimiter } from '@/lib/middleware/rate-limiter';

/**
 * Parses query parameters from a URL into a plain object suitable for
 * Zod validation. Converts numeric strings to numbers where applicable.
 */
function parseQueryParams(url: string): Record<string, unknown> {
  const { searchParams } = new URL(url);
  const params: Record<string, unknown> = {};

  const startDate = searchParams.get('startDate');
  if (startDate) params.startDate = startDate;

  const endDate = searchParams.get('endDate');
  if (endDate) params.endDate = endDate;

  const direction = searchParams.get('direction');
  if (direction) params.direction = direction;

  const status = searchParams.get('status');
  if (status) params.status = status;

  const page = searchParams.get('page');
  if (page) {
    const parsed = parseInt(page, 10);
    params.page = isNaN(parsed) ? page : parsed;
  }

  return params;
}

export async function GET(request: Request) {
  try {
    // Step 1: Extract auth context from Edge middleware headers.
    const userId = request.headers.get('x-user-id');
    const userRole = request.headers.get('x-user-role');

    // Step 2: Role guard — USER and MERCHANT can view transaction history.
    const roleGuard = requireRole('USER', 'MERCHANT');
    const roleError = roleGuard(userRole);
    if (roleError) {
      return roleError;
    }

    // Step 3: Rate limit check by user ID.
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

    // Step 4: Parse and validate query parameters with Zod.
    const queryParams = parseQueryParams(request.url);
    const validation = validateRequest(historyFilterSchema, queryParams);
    if (validation.error) {
      return validation.error;
    }

    // Step 5: Map validated filters to service layer format.
    // The service expects status in uppercase (COMPLETED/FAILED).
    const filters: {
      page?: number;
      startDate?: string;
      endDate?: string;
      direction?: 'sent' | 'received';
      status?: 'COMPLETED' | 'FAILED';
    } = {};

    if (validation.data.page) filters.page = validation.data.page;
    if (validation.data.startDate) filters.startDate = validation.data.startDate;
    if (validation.data.endDate) filters.endDate = validation.data.endDate;
    if (validation.data.direction) filters.direction = validation.data.direction;
    if (validation.data.status) {
      filters.status = validation.data.status.toUpperCase() as 'COMPLETED' | 'FAILED';
    }

    // Step 6: Delegate to PaymentService.getTransactionHistory.
    const result = await getTransactionHistory(userId!, filters);

    // Step 7: Return paginated transaction history.
    return Response.json(
      {
        transactions: result.transactions,
        pagination: result.pagination,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    // Unexpected error — do not leak internal details.
    console.error('Transaction history error:', error);
    return Response.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 },
    );
  }
}
