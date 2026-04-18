import { z } from 'zod';

/**
 * Create token request validation schema.
 * Validates parameters for deploying a new SEP-41 token contract.
 * - name: 1–32 characters
 * - symbol: 1–12 characters
 * - decimals: integer in range 0–18
 * - initialSupply: positive numeric string (supports large i128 values)
 * Requirements: 7.5, 7.6
 */
export const createTokenSchema = z.object({
  name: z
    .string()
    .min(1, 'Token name is required')
    .max(32, 'Token name must be at most 32 characters'),
  symbol: z
    .string()
    .min(1, 'Token symbol is required')
    .max(12, 'Token symbol must be at most 12 characters'),
  decimals: z
    .number()
    .int('Decimals must be an integer')
    .min(0, 'Decimals must be at least 0')
    .max(18, 'Decimals must be at most 18'),
  initialSupply: z
    .string()
    .min(1, 'Initial supply is required')
    .regex(/^\d+$/, 'Initial supply must be a numeric string')
    .refine((val) => BigInt(val) > 0n, {
      message: 'Initial supply must be positive',
    }),
});

export type CreateTokenInput = z.infer<typeof createTokenSchema>;
