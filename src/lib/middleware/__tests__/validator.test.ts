/**
 * Unit tests for the Zod validation wrapper.
 *
 * Validates:
 * - Valid data returns parsed result with data and null error
 * - Invalid data returns a 400 Response with structured error messages
 * - Zod field path and message are correctly formatted
 *
 * @see Requirements 13.4 (validate and sanitize all user-supplied inputs)
 */

import { z } from 'zod';
import { validateRequest } from '../validator';

// ── Test schemas ────────────────────────────────────────────────────────

const testSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  age: z.number().min(0, 'Age must be non-negative'),
  email: z.string().email('Invalid email'),
});

const simpleSchema = z.object({
  value: z.string(),
});

// ── Tests ───────────────────────────────────────────────────────────────

describe('Validator', () => {
  describe('validateRequest', () => {
    it('returns parsed data for valid input', () => {
      const result = validateRequest(testSchema, {
        name: 'Alice',
        age: 30,
        email: 'alice@example.com',
      });

      expect(result.error).toBeNull();
      expect(result.data).toEqual({
        name: 'Alice',
        age: 30,
        email: 'alice@example.com',
      });
    });

    it('returns a 400 Response for invalid input', () => {
      const result = validateRequest(testSchema, {
        name: '',
        age: -5,
        email: 'not-an-email',
      });

      expect(result.data).toBeNull();
      expect(result.error).toBeInstanceOf(Response);
      expect(result.error!.status).toBe(400);
    });

    it('includes structured error details with field paths', async () => {
      const result = validateRequest(testSchema, {
        name: '',
        age: -5,
        email: 'bad',
      });

      const body = await result.error!.json();
      expect(body.error).toBe('Validation failed.');
      expect(body.details).toBeDefined();
      expect(Array.isArray(body.details)).toBe(true);

      // Should have errors for name, age, and email.
      const fields = body.details.map((d: { field: string }) => d.field);
      expect(fields).toContain('name');
      expect(fields).toContain('age');
      expect(fields).toContain('email');
    });

    it('includes error messages for each field', async () => {
      const result = validateRequest(testSchema, {
        name: '',
        age: 25,
        email: 'valid@example.com',
      });

      const body = await result.error!.json();
      const nameError = body.details.find((d: { field: string }) => d.field === 'name');
      expect(nameError).toBeDefined();
      expect(nameError.message).toBeDefined();
      expect(typeof nameError.message).toBe('string');
    });

    it('returns data: null when validation fails', () => {
      const result = validateRequest(simpleSchema, { value: 123 });
      expect(result.data).toBeNull();
    });

    it('returns error: null when validation succeeds', () => {
      const result = validateRequest(simpleSchema, { value: 'hello' });
      expect(result.error).toBeNull();
    });

    it('handles missing fields in the input', async () => {
      const result = validateRequest(testSchema, {});

      expect(result.data).toBeNull();
      const body = await result.error!.json();
      expect(body.details.length).toBeGreaterThan(0);
    });

    it('handles null input', () => {
      const result = validateRequest(testSchema, null);
      expect(result.data).toBeNull();
      expect(result.error).toBeInstanceOf(Response);
    });

    it('strips extra fields from the output (Zod default)', () => {
      const result = validateRequest(simpleSchema, {
        value: 'hello',
        extra: 'should be removed',
      });

      expect(result.data).toEqual({ value: 'hello' });
    });
  });
});
