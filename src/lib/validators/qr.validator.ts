import { z } from 'zod';

// Stellar address: 56-char string starting with 'G'
const stellarAddressSchema = z.string()
  .length(56, 'Stellar address must be exactly 56 characters')
  .regex(/^G/, 'Stellar address must start with G');

/**
 * Dynamic QR code generation schema.
 * Requires a positive amount and optional description.
 */
export const dynamicQRSchema = z.object({
  amount: z.number()
    .positive('Amount must be positive')
    .refine(
      (val) => {
        const parts = val.toString().split('.');
        return !parts[1] || parts[1].length <= 7;
      },
      'Amount cannot have more than 7 decimal places'
    ),
  description: z.string().max(200, 'Description cannot exceed 200 characters').optional(),
});

/**
 * QR code payload parse schema.
 * Validates the decoded QR payload contains a valid Stellar address
 * and optional amount/description fields.
 */
export const qrParseSchema = z.object({
  address: stellarAddressSchema,
  amount: z.number().positive().optional(),
  description: z.string().max(200).optional(),
});

export type DynamicQRInput = z.infer<typeof dynamicQRSchema>;
export type QRParseInput = z.infer<typeof qrParseSchema>;
