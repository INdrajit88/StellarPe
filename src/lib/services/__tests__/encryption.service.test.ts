/**
 * Unit tests for EncryptionService.
 *
 * Validates AES-256-GCM encrypt/decrypt, HKDF key derivation,
 * and security requirements (never expose plaintext keys).
 *
 * @see Requirements 2.3, 2.7, 13.3
 */

import { encrypt, decrypt } from '../encryption.service';

// Set the master key before any test runs.
const TEST_MASTER_KEY = 'test-master-key-for-unit-tests-32chars!!';

beforeAll(() => {
  process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
});

afterAll(() => {
  delete process.env.ENCRYPTION_MASTER_KEY;
});

describe('EncryptionService', () => {
  describe('encrypt()', () => {
    it('returns an object with ciphertext, iv, and authTag as hex strings', () => {
      const result = encrypt('hello world');

      expect(result).toHaveProperty('ciphertext');
      expect(result).toHaveProperty('iv');
      expect(result).toHaveProperty('authTag');

      // All values should be valid hex strings.
      expect(result.ciphertext).toMatch(/^[0-9a-f]+$/);
      expect(result.iv).toMatch(/^[0-9a-f]+$/);
      expect(result.authTag).toMatch(/^[0-9a-f]+$/);
    });

    it('produces a 24-character hex IV (12 bytes)', () => {
      const result = encrypt('test');
      // 12 bytes = 24 hex characters
      expect(result.iv).toHaveLength(24);
    });

    it('produces a 32-character hex authTag (16 bytes)', () => {
      const result = encrypt('test');
      // 16 bytes = 32 hex characters
      expect(result.authTag).toHaveLength(32);
    });

    it('generates a unique IV for each encryption call', () => {
      const r1 = encrypt('same input');
      const r2 = encrypt('same input');

      // IVs must differ for GCM security.
      expect(r1.iv).not.toBe(r2.iv);
    });

    it('produces different ciphertext for the same plaintext (due to unique IV)', () => {
      const r1 = encrypt('same input');
      const r2 = encrypt('same input');

      expect(r1.ciphertext).not.toBe(r2.ciphertext);
    });

    it('ciphertext does not contain the plaintext', () => {
      const secret = 'SCZANGBA5YHTNYVVV3C7CAZMCLXPILHSE7KA52FYI7RCZPYDHO2SYZXGT';
      const result = encrypt(secret);

      // The hex-encoded ciphertext should not contain the original ASCII string.
      expect(result.ciphertext).not.toContain(secret);
    });
  });

  describe('decrypt()', () => {
    it('recovers the original plaintext after encryption', () => {
      const plaintext = 'my-stellar-secret-key';
      const encrypted = encrypt(plaintext);

      const recovered = decrypt(encrypted.ciphertext, encrypted.iv, encrypted.authTag);
      expect(recovered).toBe(plaintext);
    });

    it('handles empty string', () => {
      const plaintext = '';
      const encrypted = encrypt(plaintext);

      const recovered = decrypt(encrypted.ciphertext, encrypted.iv, encrypted.authTag);
      expect(recovered).toBe(plaintext);
    });

    it('handles long plaintext', () => {
      const plaintext = 'A'.repeat(1000);
      const encrypted = encrypt(plaintext);

      const recovered = decrypt(encrypted.ciphertext, encrypted.iv, encrypted.authTag);
      expect(recovered).toBe(plaintext);
    });

    it('handles Unicode characters', () => {
      const plaintext = '🔑 Stellar key: привет мир 日本語';
      const encrypted = encrypt(plaintext);

      const recovered = decrypt(encrypted.ciphertext, encrypted.iv, encrypted.authTag);
      expect(recovered).toBe(plaintext);
    });
  });

  describe('authentication and tamper detection', () => {
    it('throws when ciphertext is tampered with', () => {
      const encrypted = encrypt('sensitive data');

      // Flip a hex character in the ciphertext.
      const tampered = encrypted.ciphertext[0] === 'a' ? 'b' + encrypted.ciphertext.slice(1) : 'a' + encrypted.ciphertext.slice(1);

      expect(() => decrypt(tampered, encrypted.iv, encrypted.authTag)).toThrow();
    });

    it('throws when authTag is tampered with', () => {
      const encrypted = encrypt('sensitive data');

      // Flip a hex character in the auth tag.
      const tampered = encrypted.authTag[0] === 'a' ? 'b' + encrypted.authTag.slice(1) : 'a' + encrypted.authTag.slice(1);

      expect(() => decrypt(encrypted.ciphertext, encrypted.iv, tampered)).toThrow();
    });

    it('throws when IV is tampered with', () => {
      const encrypted = encrypt('sensitive data');

      // Flip a hex character in the IV.
      const tampered = encrypted.iv[0] === 'a' ? 'b' + encrypted.iv.slice(1) : 'a' + encrypted.iv.slice(1);

      expect(() => decrypt(encrypted.ciphertext, tampered, encrypted.authTag)).toThrow();
    });
  });

  describe('key derivation', () => {
    it('throws when ENCRYPTION_MASTER_KEY is not set', () => {
      const original = process.env.ENCRYPTION_MASTER_KEY;
      delete process.env.ENCRYPTION_MASTER_KEY;

      expect(() => encrypt('test')).toThrow('ENCRYPTION_MASTER_KEY is not set');

      // Restore for subsequent tests.
      process.env.ENCRYPTION_MASTER_KEY = original;
    });

    it('produces different ciphertext with a different master key', () => {
      const plaintext = 'same input';
      const r1 = encrypt(plaintext);

      // Change the master key.
      process.env.ENCRYPTION_MASTER_KEY = 'different-master-key-also-32chars!!';
      const r2 = encrypt(plaintext);

      // Restore original key.
      process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;

      // Even ignoring the random IV difference, decrypting r2 with the
      // original key should fail, confirming different keys produce different output.
      expect(() => decrypt(r2.ciphertext, r2.iv, r2.authTag)).toThrow();
    });
  });
});
