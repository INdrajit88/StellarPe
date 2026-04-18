import { z } from 'zod';

/**
 * Reusable refinement for positive numeric strings.
 * Validates that the value is a non-empty numeric string where BigInt(val) > 0.
 */
const positiveAmountString = (fieldName: string) =>
  z
    .string()
    .min(1, `${fieldName} is required`)
    .regex(/^\d+$/, `${fieldName} must be a numeric string`)
    .refine((val) => BigInt(val) > 0n, {
      message: `${fieldName} must be positive`,
    });

/**
 * PIN validation: 4–6 digit string.
 */
const pinSchema = z
  .string()
  .regex(/^\d{4,6}$/, 'PIN must be 4 to 6 digits');

/**
 * Deposit into a liquidity pool request validation schema.
 * Requires pool contract ID, amounts for both tokens, and a PIN.
 * Requirements: 8.6
 */
export const depositSchema = z.object({
  poolContractId: z.string().min(1, 'Pool contract ID is required'),
  amountA: positiveAmountString('Amount A'),
  amountB: positiveAmountString('Amount B'),
  pin: pinSchema,
});

/**
 * Withdraw from a liquidity pool request validation schema.
 * Requires pool contract ID, share amount, and a PIN.
 * Requirements: 8.6
 */
export const withdrawSchema = z.object({
  poolContractId: z.string().min(1, 'Pool contract ID is required'),
  shares: positiveAmountString('Shares'),
  pin: pinSchema,
});

/**
 * Swap tokens through a liquidity pool request validation schema.
 * Requires pool contract ID, input token, input amount, minimum output amount, and a PIN.
 * Requirements: 9.5
 */
export const swapSchema = z.object({
  poolContractId: z.string().min(1, 'Pool contract ID is required'),
  inputToken: z.string().min(1, 'Input token is required'),
  inputAmount: positiveAmountString('Input amount'),
  minOutputAmount: positiveAmountString('Minimum output amount'),
  pin: pinSchema,
});

export type DepositInput = z.infer<typeof depositSchema>;
export type WithdrawInput = z.infer<typeof withdrawSchema>;
export type SwapInput = z.infer<typeof swapSchema>;
