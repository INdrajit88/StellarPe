/**
 * Property-based tests for environment configuration validation.
 *
 * Feature: stellar-pay, Property 34: Missing environment variable terminates startup
 *
 * Validates: Requirements 14.3
 *
 * Uses fast-check to generate arbitrary subsets of required environment
 * variables and verify that the system terminates when any are missing.
 */

import fc from 'fast-check';
import { jest } from '@jest/globals';

// ── Required environment variable names ──────────────────────────────────────

const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'ENCRYPTION_MASTER_KEY',
  'STELLAR_NETWORK_PASSPHRASE',
] as const;

/** Valid values for each required env var (used when setting them). */
const VALID_ENV_VALUES: Record<string, string> = {
  DATABASE_URL: 'postgresql://localhost:5432/test',
  JWT_SECRET: 'test-jwt-secret-for-property-tests',
  ENCRYPTION_MASTER_KEY: 'test-master-key-32-chars-long!!!',
  STELLAR_NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Environment Configuration — Property Tests', () => {
  const ORIGINAL_ENV = process.env;
  let exitSpy: ReturnType<typeof jest.spyOn>;
  let errorSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    // Reset module cache so env.ts re-runs validateEnv on each import
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as unknown as (code?: number) => never);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });

  /** Sets all required env vars to valid values. */
  function setAllRequired(): void {
    for (const key of REQUIRED_ENV_VARS) {
      process.env[key] = VALID_ENV_VALUES[key];
    }
  }

  // ── Property 34: Missing environment variable terminates startup ───────────

  describe('Property 34: Missing environment variable terminates startup', () => {
    // Feature: stellar-pay, Property 34: Missing environment variable terminates startup
    it('terminates with process.exit(1) when any non-empty subset of required vars is missing', async () => {
      /**
       * Validates: Requirements 14.3
       *
       * For any non-empty subset of required environment variables, if those
       * variables are absent at startup, the system should log a descriptive
       * error naming each missing variable and terminate the process.
       */
      await fc.assert(
        fc.asyncProperty(
          fc.subarray([...REQUIRED_ENV_VARS], { minLength: 1, maxLength: 4 }),
          async (varsToRemove) => {
            // Reset modules to force re-import
            jest.resetModules();
            exitSpy.mockClear();
            errorSpy.mockClear();

            // Set all required vars, then remove the selected subset
            setAllRequired();
            for (const key of varsToRemove) {
              delete process.env[key];
            }

            // Importing env.ts should trigger process.exit(1)
            await expect(import('@/lib/env')).rejects.toThrow('process.exit called');

            // process.exit should have been called with code 1
            expect(exitSpy).toHaveBeenCalledWith(1);

            // Each missing variable should be named in a console.error call
            for (const key of varsToRemove) {
              expect(errorSpy).toHaveBeenCalledWith(
                `Missing required environment variable: ${key}`,
              );
            }

            return true;
          },
        ),
        { numRuns: 15 },
      );
    }, 120_000);

    // Feature: stellar-pay, Property 34: Missing environment variable terminates startup
    it('does NOT terminate when all required variables are present', async () => {
      /**
       * Validates: Requirements 14.3
       *
       * When all required environment variables are set, the system should
       * start successfully without calling process.exit.
       */
      jest.resetModules();
      setAllRequired();

      const { env } = await import('@/lib/env');

      // process.exit should NOT have been called
      expect(exitSpy).not.toHaveBeenCalled();

      // All values should be accessible
      expect(env.DATABASE_URL).toBe(VALID_ENV_VALUES.DATABASE_URL);
      expect(env.JWT_SECRET).toBe(VALID_ENV_VALUES.JWT_SECRET);
      expect(env.ENCRYPTION_MASTER_KEY).toBe(VALID_ENV_VALUES.ENCRYPTION_MASTER_KEY);
      expect(env.STELLAR_NETWORK_PASSPHRASE).toBe(VALID_ENV_VALUES.STELLAR_NETWORK_PASSPHRASE);
    });

    // Feature: stellar-pay, Property 34: Missing environment variable terminates startup
    it('each individual required variable causes termination when missing', async () => {
      /**
       * Validates: Requirements 14.3
       *
       * For each required environment variable individually, removing it
       * should cause the system to terminate and log the specific variable name.
       */
      for (const varName of REQUIRED_ENV_VARS) {
        jest.resetModules();
        exitSpy.mockClear();
        errorSpy.mockClear();

        setAllRequired();
        delete process.env[varName];

        await expect(import('@/lib/env')).rejects.toThrow('process.exit called');

        expect(exitSpy).toHaveBeenCalledWith(1);
        expect(errorSpy).toHaveBeenCalledWith(
          `Missing required environment variable: ${varName}`,
        );
      }
    });

    // Feature: stellar-pay, Property 34: Missing environment variable terminates startup
    it('HORIZON_URL defaults to testnet when not provided (not required)', async () => {
      /**
       * Validates: Requirements 14.3, 14.4
       *
       * HORIZON_URL is optional and should default to the testnet endpoint.
       * The system should NOT terminate when only HORIZON_URL is missing.
       */
      jest.resetModules();
      setAllRequired();
      delete process.env.HORIZON_URL;

      const { env } = await import('@/lib/env');

      expect(exitSpy).not.toHaveBeenCalled();
      expect(env.HORIZON_URL).toBe('https://horizon-testnet.stellar.org');
    });
  });
});
