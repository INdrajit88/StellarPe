import { z } from 'zod';

// Stellar address: 56-char string starting with 'G'
const stellarAddressSchema = z.string()
  .length(56, 'Stellar address must be exactly 56 characters')
  .regex(/^G/, 'Stellar address must start with G');

/**
 * Create contact validation schema.
 * Requires a display name and either a Stellar address or a username (or both).
 */
export const createContactSchema = z.object({
  displayName: z.string().min(1, 'Display name is required').max(100),
  stellarAddress: stellarAddressSchema.optional(),
  username: z.string().min(3).max(30).regex(
    /^[a-zA-Z0-9_]+$/,
    'Username must contain only alphanumeric characters and underscores'
  ).optional(),
}).refine(
  (data) => data.stellarAddress || data.username,
  'Either stellarAddress or username must be provided'
);

/**
 * Update contact validation schema.
 * All fields are optional, but at least one must be provided.
 */
export const updateContactSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  stellarAddress: stellarAddressSchema.optional(),
  username: z.string().min(3).max(30).regex(
    /^[a-zA-Z0-9_]+$/,
    'Username must contain only alphanumeric characters and underscores'
  ).optional(),
}).refine(
  (data) => data.displayName || data.stellarAddress || data.username,
  'At least one field must be provided for update'
);

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
