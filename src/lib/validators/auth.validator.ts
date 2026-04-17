import { z } from 'zod';

// Username: alphanumeric + underscores, 3-30 chars
const usernameSchema = z.string().min(3).max(30).regex(
  /^[a-zA-Z0-9_]+$/,
  'Username must contain only alphanumeric characters and underscores'
);

// Role enum for registration (Admin accounts are created differently)
const registrationRoleSchema = z.enum(['USER', 'MERCHANT']);

/**
 * Registration request validation schema.
 * Validates username format, email, password strength, and role.
 */
export const registrationSchema = z.object({
  username: usernameSchema,
  email: z.string().min(1, 'Email is required').regex(
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    'Invalid email format'
  ),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: registrationRoleSchema,
});

/**
 * Login request validation schema.
 * Validates email format and password presence.
 */
export const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').regex(
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    'Invalid email format'
  ),
  password: z.string().min(1, 'Password is required'),
});

export type RegistrationInput = z.infer<typeof registrationSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
