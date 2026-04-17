/**
 * AdminService — Platform administration: dashboard stats, user management,
 * and account status control.
 *
 * Provides:
 * - Aggregated platform metrics (user/merchant/transaction counts, XLM volume)
 * - Paginated user listing with optional username/email search
 * - Account activation/deactivation (inactive accounts are rejected at login)
 *
 * SECURITY: All admin endpoints must be guarded by the role-guard middleware
 * to ensure only ADMIN-role users can access these operations.
 *
 * @see Requirements 12.1 (dashboard stats), 12.2 (paginated user list),
 *      12.3 (search by username/email), 12.4 (deactivate account),
 *      12.5 (reactivate account), 12.6 (admin-only access)
 */

import { prisma } from '@/lib/prisma';

// ── Constants ────────────────────────────────────────────────────────────

/** Default page size for user management list. */
const DEFAULT_PAGE_SIZE = 25;

// ── Error codes ──────────────────────────────────────────────────────────

export const AdminErrorCode = {
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  INVALID_STATUS: 'INVALID_STATUS',
} as const;

export class AdminError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'AdminError';
  }
}

// ── getDashboardStats ────────────────────────────────────────────────────

/**
 * Aggregates platform-level statistics for the admin dashboard.
 *
 * Returns:
 * - Total registered User count (role = USER)
 * - Total registered Merchant count (role = MERCHANT)
 * - Total Transaction count
 * - Total XLM volume transacted (sum of all completed transaction amounts)
 * - Count of failed transactions in the last 24 hours
 *
 * @returns An object with aggregated platform metrics.
 *
 * @see Requirements 12.1
 */
export async function getDashboardStats(): Promise<{
  userCount: number;
  merchantCount: number;
  txCount: number;
  volume: string;
  failedLast24h: number;
}> {
  const twentyFourHoursAgo = new Date();
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

  // Run all aggregation queries in parallel for performance
  const [userCount, merchantCount, txCount, volumeResult, failedLast24h] =
    await Promise.all([
      // Count users with role USER
      prisma.user.count({
        where: { role: 'USER' },
      }),

      // Count users with role MERCHANT
      prisma.user.count({
        where: { role: 'MERCHANT' },
      }),

      // Total transaction count
      prisma.transaction.count(),

      // Sum of all completed transaction amounts
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { status: 'COMPLETED' },
      }),

      // Failed transactions in the last 24 hours
      prisma.transaction.count({
        where: {
          status: 'FAILED',
          createdAt: { gte: twentyFourHoursAgo },
        },
      }),
    ]);

  // Prisma aggregate returns Decimal or null for _sum.
  // Convert to string to avoid floating-point precision issues when
  // transmitting large XLM volumes over JSON (Decimal → string is lossless).
  const volume = volumeResult._sum.amount
    ? String(volumeResult._sum.amount)
    : '0';

  return {
    userCount,
    merchantCount,
    txCount,
    volume,
    failedLast24h,
  };
}

// ── listUsers ────────────────────────────────────────────────────────────

/**
 * Returns a paginated list of all registered users and merchants.
 *
 * Supports optional search by username or email (case-insensitive partial match).
 * Default page size is 25 records per page.
 *
 * @param page - The page number (1-indexed). Defaults to 1.
 * @param search - Optional search string to filter by username or email.
 * @returns An object with the user list and pagination metadata.
 *
 * @see Requirements 12.2, 12.3
 */
export async function listUsers(
  page: number = 1,
  search?: string,
): Promise<{
  users: Record<string, unknown>[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}> {
  const pageSize = DEFAULT_PAGE_SIZE;
  const skip = (page - 1) * pageSize;

  // Build the where clause — optional search filter
  const where: Record<string, unknown> = {};

  if (search && search.trim().length > 0) {
    // Search by username OR email (case-insensitive partial match)
    where.OR = [
      { username: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users: users as unknown as Record<string, unknown>[],
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

// ── setAccountStatus ─────────────────────────────────────────────────────

/**
 * Sets a user's account status to active or inactive.
 *
 * When an account is set to INACTIVE, the AuthService login flow will
 * reject all subsequent login attempts for that account. When set back
 * to ACTIVE, the account can log in normally again.
 *
 * @param userId - The ID of the user to update.
 * @param status - The new account status: 'ACTIVE' or 'INACTIVE'.
 * @throws AdminError if the user is not found or the status is invalid.
 *
 * @see Requirements 12.4, 12.5
 */
export async function setAccountStatus(
  userId: string,
  status: 'ACTIVE' | 'INACTIVE',
): Promise<void> {
  // Validate the status value
  if (status !== 'ACTIVE' && status !== 'INACTIVE') {
    throw new AdminError(
      `Invalid account status: "${status}". Must be "ACTIVE" or "INACTIVE".`,
      AdminErrorCode.INVALID_STATUS,
      400,
    );
  }

  // Verify the user exists
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) {
    throw new AdminError(
      `User with ID "${userId}" not found.`,
      AdminErrorCode.USER_NOT_FOUND,
      404,
    );
  }

  // Update the account status
  await prisma.user.update({
    where: { id: userId },
    data: { status },
  });
}
