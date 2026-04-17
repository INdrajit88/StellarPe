/**
 * Environment configuration module.
 *
 * Validates all required environment variables at import time (module load).
 * If any required variable is missing, logs a descriptive error naming the
 * missing variable and terminates the process with exit code 1 — this
 * prevents the application from running in a misconfigured state.
 *
 * HORIZON_URL defaults to the Stellar testnet endpoint when not provided,
 * per Requirement 14.4.
 *
 * IMPORTANT: This module is intentionally NOT imported by services that run
 * during test setup (e.g. EncryptionService, AuthService) because the
 * process.exit(1) call would kill the test runner. Those services read
 * process.env directly instead.
 *
 * @see Requirements 14.1 (load config from env vars), 14.2 (.env.example),
 *      14.3 (terminate on missing vars), 14.4 (default to testnet Horizon)
 */

/** Environment variables that MUST be present for the application to start. */
const REQUIRED_ENV_VARS = [
  'DATABASE_URL',              // PostgreSQL connection string for Prisma
  'JWT_SECRET',                // HMAC signing key for JWT tokens
  'ENCRYPTION_MASTER_KEY',     // Master secret for HKDF → AES-256-GCM key derivation
  'STELLAR_NETWORK_PASSPHRASE', // Stellar network identifier (testnet or public)
] as const;

/** Fallback Horizon URL — Stellar testnet endpoint (Requirement 14.4). */
const HORIZON_URL_DEFAULT = 'https://horizon-testnet.stellar.org';

/**
 * Validates that all required environment variables are present and returns
 * a typed configuration object.
 *
 * Called once at module load time. If any variable is missing, each missing
 * key is logged individually before the process terminates — this makes it
 * easy to identify all missing variables in a single run rather than fixing
 * them one at a time.
 */
function validateEnv(): {
  DATABASE_URL: string;
  JWT_SECRET: string;
  ENCRYPTION_MASTER_KEY: string;
  STELLAR_NETWORK_PASSPHRASE: string;
  HORIZON_URL: string;
} {
  const missing: string[] = [];

  for (const key of REQUIRED_ENV_VARS) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    // Log each missing variable individually for clear diagnostics
    for (const key of missing) {
      console.error(
        `Missing required environment variable: ${key}`
      );
    }
    // Hard exit — do not allow the app to run in a misconfigured state
    process.exit(1);
  }

  return {
    DATABASE_URL: process.env.DATABASE_URL!,
    JWT_SECRET: process.env.JWT_SECRET!,
    ENCRYPTION_MASTER_KEY: process.env.ENCRYPTION_MASTER_KEY!,
    STELLAR_NETWORK_PASSPHRASE: process.env.STELLAR_NETWORK_PASSPHRASE!,
    // HORIZON_URL is optional — defaults to testnet if not provided
    HORIZON_URL: process.env.HORIZON_URL || HORIZON_URL_DEFAULT,
  };
}

/** Validated environment configuration, available as a typed singleton. */
export const env = validateEnv();
