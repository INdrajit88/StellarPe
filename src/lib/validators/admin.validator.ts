import { z } from 'zod';

/**
 * Account status update schema.
 * Allows admins to activate or deactivate user accounts.
 */
export const accountStatusUpdateSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

/**
 * User search/list schema.
 * Supports optional search query and pagination.
 */
export const userSearchSchema = z.object({
  search: z.string().max(100).optional(),
  page: z.number().int().positive().optional(),
});

export type AccountStatusUpdateInput = z.infer<typeof accountStatusUpdateSchema>;
export type UserSearchInput = z.infer<typeof userSearchSchema>;
