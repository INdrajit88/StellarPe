import { z } from 'zod';

/**
 * Send payment request validation schema.
 * Recipient can be a username or a 56-char Stellar address starting with 'G'.
 * Amount must be positive with max 7 decimal places (Stellar precision).
 * PIN is required for transaction authorization.
 */
export const sendPaymentSchema = z.object({
  recipient: z.string().min(1, 'Recipient is required'),
  amount: z.number()
    .positive('Amount must be positive')
    .refine(
      (val) => {
        // Ensure max 7 decimal places (Stellar precision)
        const parts = val.toString().split('.');
        return !parts[1] || parts[1].length <= 7;
      },
      'Amount cannot have more than 7 decimal places'
    ),
  pin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4-6 numeric digits'),
  memo: z.string().max(28, 'Memo cannot exceed 28 characters').optional(),
});

/**
 * Transaction history filter schema.
 * All fields are optional; filters are applied conjunctively.
 */
export const historyFilterSchema = z.object({
  startDate: z.string()
    .refine((val) => !isNaN(Date.parse(val)), 'Invalid ISO date string')
    .optional(),
  endDate: z.string()
    .refine((val) => !isNaN(Date.parse(val)), 'Invalid ISO date string')
    .optional(),
  direction: z.enum(['sent', 'received']).optional(),
  status: z.enum(['completed', 'failed']).optional(),
  page: z.number().int().positive().optional(),
});

export type SendPaymentInput = z.infer<typeof sendPaymentSchema>;
export type HistoryFilterInput = z.infer<typeof historyFilterSchema>;
