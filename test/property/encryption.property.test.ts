/**
 * Property-based tests for EncryptionService round-trip.
 *
 * Feature: stellar-pay, Property 7: Encryption round-trip preserves secret key
 *
 * Validates: Requirements 2.3
 *
 * Uses fast-check to generate arbitrary strings and verifies that
 * encrypting then decrypting always produces the original plaintext.
 */

import fc from 'fast-check';
import { encrypt, decrypt } from '@/lib/services/encryption.service';

// Set the master key before any test runs so HKDF key derivation works.
const TEST_MASTER_KEY = 'test-master-key-for-property-tests-32!!';

beforeAll(() => {
  process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY;
});

afterAll(() => {
  delete process.env.ENCRYPTION_MASTER_KEY;
});

describe('EncryptionService — Property Tests', () => {
  // Feature: stellar-pay, Property 7: Encryption round-trip preserves secret key
  it('Property 7: encrypt → decrypt round-trip preserves any ASCII string', () => {
    /**
     * Validates: Requirements 2.3
     *
     * For any random string, encrypting it with EncryptionService and then
     * decrypting the result should produce the original plaintext string.
     */
    fc.assert(
      fc.property(fc.string(), (plaintext) => {
        const encrypted = encrypt(plaintext);
        const decrypted = decrypt(encrypted.ciphertext, encrypted.iv, encrypted.authTag);
        return decrypted === plaintext;
      }),
      { numRuns: 20 }
    );
  });

  // Feature: stellar-pay, Property 7: Encryption round-trip preserves secret key
  it('Property 7: encrypt → decrypt round-trip preserves any Unicode string', () => {
    /**
     * Validates: Requirements 2.3
     *
     * Extends the round-trip property to Unicode inputs including
     * CJK characters, Cyrillic, accented Latin, and other multi-byte sequences.
     */
    fc.assert(
      fc.property(fc.stringMatching(/[\u0000-\uD7FF\uE000-\uFFFF]*/), (plaintext) => {
        const encrypted = encrypt(plaintext);
        const decrypted = decrypt(encrypted.ciphertext, encrypted.iv, encrypted.authTag);
        return decrypted === plaintext;
      }),
      { numRuns: 20 }
    );
  });
});
