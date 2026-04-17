/**
 * Zod schema validation wrapper for API route handlers.
 *
 * Provides `validateRequest` which parses a request body (or any data)
 * against a Zod schema and returns either the parsed data or a structured
 * 400 error Response.
 *
 * Usage in a route handler:
 *   const result = validateRequest(sendPaymentSchema, body);
 *   if (result.error) return result.error; // Returns a 400 Response
 *   const data = result.data; // Typed, validated data
 *
 * @see Requirements 13.4 (validate and sanitize all user-supplied inputs)
 */

import type { ZodType, ZodError } from 'zod';

export interface ValidationSuccess<T> {
  data: T;
  error: null;
}

export interface ValidationFailure {
  data: null;
  error: Response;
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

/**
 * Formats a Zod error into a structured error payload.
 */
function formatZodError(zodError: ZodError): {
  error: string;
  details: Array<{ field: string; message: string }>;
} {
  const details = zodError.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));

  return {
    error: 'Validation failed.',
    details,
  };
}

/**
 * Validates data against a Zod schema.
 *
 * @param schema - The Zod schema to validate against.
 * @param data - The data to validate (typically a parsed request body).
 * @returns A `ValidationResult` with either the parsed data or a 400 Response.
 */
export function validateRequest<T>(
  schema: ZodType<T>,
  data: unknown,
): ValidationResult<T> {
  const result = schema.safeParse(data);

  if (result.success) {
    return { data: result.data, error: null };
  }

  const errorPayload = formatZodError(result.error);

  return {
    data: null,
    error: Response.json(errorPayload, { status: 400 }),
  };
}
