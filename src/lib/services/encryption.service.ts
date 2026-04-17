/**
 * EncryptionService — AES-256-GCM encryption/decryption for Stellar secret keys.
 *
 * Design decisions:
 * - Uses AES-256-GCM for authenticated encryption (confidentiality + integrity).
 * - Derives the 256-bit encryption key from ENCRYPTION_MASTER_KEY via HKDF (SHA-256),
 *   so the raw env var doesn't need to be exactly 32 bytes.
 * - Each encrypt() call generates a fresh 12-byte random IV (96 bits, recommended for GCM).
 * - Returns ciphertext, IV, and authTag as hex strings for safe database storage.
 *
 * SECURITY: Plaintext keys and the derived encryption key are NEVER logged or exposed.
 *
 * @see Requirements 2.3 (AES-256-GCM encryption), 2.7 (never expose plaintext), 13.3 (key from env)
 */

import crypto from 'crypto';

/** The algorithm used for symmetric encryption. */
const ALGORITHM = 'aes-256-gcm';

/** IV length in bytes — 96 bits is the recommended size for GCM. */
const IV_LENGTH = 12;

/** Auth tag length in bytes — 128 bits provides full GCM authentication strength. */
const AUTH_TAG_LENGTH = 16;

/** HKDF info string used during key derivation to bind the key to this context.
 * Using a unique info string ensures that even if the same master key is used
 * for other purposes, the derived keys will be different (domain separation). */
const HKDF_INFO = 'stellarpay-encryption';

/** HKDF salt — a fixed salt for deterministic derivation from the same master key.
 * A fixed salt is acceptable here because the master key is expected to have
 * sufficient entropy. The salt primarily helps when the input key material
 * is not uniformly random (e.g. a passphrase). */
const HKDF_SALT = 'stellarpay-salt';

export interface EncryptedPayload {
  ciphertext: string; // hex-encoded ciphertext
  iv: string;         // hex-encoded 12-byte IV
  authTag: string;    // hex-encoded 16-byte authentication tag
}

/**
 * Derives a 256-bit AES key from the master key using HKDF-SHA256.
 *
 * HKDF ensures the derived key has high entropy even if the master key
 * is a passphrase rather than raw key material.
 *
 * SECURITY: The derived key is held only in memory and never logged.
 */
function deriveKey(): Buffer {
  // Read the master key directly from process.env to avoid importing env.ts
  // at module level (env.ts validates at import time and calls process.exit,
  // which would kill the test runner during module initialization).
  const masterKey = process.env.ENCRYPTION_MASTER_KEY;

  if (!masterKey) {
    throw new Error(
      'ENCRYPTION_MASTER_KEY is not set. Cannot derive encryption key.'
    );
  }

  // crypto.hkdfSync(digest, ikm, salt, info, keylen) → Buffer
  // Derives a 32-byte (256-bit) key suitable for AES-256.
  const derived = crypto.hkdfSync(
    'sha256',
    masterKey,
    HKDF_SALT,
    HKDF_INFO,
    32 // 256 bits
  );

  // hkdfSync returns an ArrayBuffer; wrap it in a Buffer for Node crypto APIs.
  return Buffer.from(derived);
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 *
 * @param plaintext — The string to encrypt (e.g. a Stellar secret key).
 * @returns An object with hex-encoded ciphertext, iv, and authTag.
 *
 * SECURITY: `plaintext` is never logged or persisted in cleartext.
 */
export function encrypt(plaintext: string): EncryptedPayload {
  // Derive the encryption key from the master secret via HKDF.
  const key = deriveKey();

  // Generate a cryptographically random 12-byte IV for this encryption.
  // A unique IV per operation is critical for GCM security.
  const iv = crypto.randomBytes(IV_LENGTH);

  // Create the AES-256-GCM cipher with the derived key and random IV.
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  // Encrypt the plaintext. GCM handles both encryption and authentication.
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Retrieve the authentication tag — used during decryption to verify integrity.
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

/**
 * Decrypts an AES-256-GCM encrypted payload.
 *
 * @param ciphertext — Hex-encoded ciphertext.
 * @param iv — Hex-encoded 12-byte IV used during encryption.
 * @param authTag — Hex-encoded 16-byte authentication tag.
 * @returns The original plaintext string.
 * @throws If authentication fails (tampered ciphertext/IV/tag) or key is wrong.
 *
 * SECURITY: The returned plaintext should be used immediately and
 * zeroed from memory when no longer needed. Never log the return value.
 */
export function decrypt(ciphertext: string, iv: string, authTag: string): string {
  // Derive the same encryption key from the master secret.
  const key = deriveKey();

  // Reconstruct the IV and auth tag from their hex representations.
  const ivBuffer = Buffer.from(iv, 'hex');
  const authTagBuffer = Buffer.from(authTag, 'hex');

  // Create the AES-256-GCM decipher with the same key and IV.
  const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  // Set the authentication tag before decryption.
  // GCM will verify integrity during decipher.final().
  decipher.setAuthTag(authTagBuffer);

  // Decrypt and verify authenticity in one pass.
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
