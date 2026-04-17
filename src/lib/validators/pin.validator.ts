import { z } from 'zod';

/**
 * PIN set schema.
 * Transaction PIN must be 4-6 numeric digits.
 */
export const setPinSchema = z.object({
  pin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4-6 numeric digits'),
});

/**
 * PIN reset schema.
 * Requires the new PIN in 4-6 digit format.
 */
export const resetPinSchema = z.object({
  newPin: z.string().regex(/^\d{4,6}$/, 'PIN must be 4-6 numeric digits'),
});

export type SetPinInput = z.infer<typeof setPinSchema>;
export type ResetPinInput = z.infer<typeof resetPinSchema>;
