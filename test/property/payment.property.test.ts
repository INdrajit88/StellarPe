/**
 * Property-based tests for payment-related wallet security.
 *
 * Feature: stellar-pay, Property 8: Secret key never exposed in API responses or database plaintext
 *
 * Validates: Requirements 2.1, 2.4, 2.7
 *
 * Uses fast-check to generate random secret key strings and verifies that:
 * 1. createWallet never returns the secret key to the caller
 * 2. createWallet stores only ciphertext (not plaintext) in the database
 * 3. getWalletDetails never returns any secret key material
 */

import fc from 'fast-check';
import { jest } from '@jest/globals';

// ── Module mocks ─────────────────────────────────────────────────────────────
// Mock StellarService and EncryptionService at the module level so the
// WalletService imports receive our stubs instead of the real implementations.

jest.mock('@/lib/services/stellar.service', () => ({
  __esModule: true,
  generateKeypair: jest.fn(),
  fundAccount: jest.fn(),
  getBalance: jest.fn(),
}));

jest.mock('@/lib/services/encryption.service', () => ({
  __esModule: true,
  encrypt: jest.fn(),
  decrypt: jest.fn(),
}));

// Prisma is already mocked globally via test/setup.ts

// ── Imports (after mocks are set up) ─────────────────────────────────────────

import { createWallet, getWalletDetails } from '@/lib/services/wallet.service';
import { generateKeypair, fundAccount, getBalance } from '@/lib/services/stellar.service';
import { encrypt } from '@/lib/services/encryption.service';
import { prisma } from '@/lib/prisma';

// ── Typed mocks ──────────────────────────────────────────────────────────────

const mockGenerateKeypair = generateKeypair as jest.MockedFunction<typeof generateKeypair>;
const mockFundAccount = fundAccount as jest.MockedFunction<typeof fundAccount>;
const mockGetBalance = getBalance as jest.MockedFunction<typeof getBalance>;
const mockEncrypt = encrypt as jest.MockedFunction<typeof encrypt>;
const mockPrisma = prisma as unknown as {
  wallet: {
    create: jest.Mock;
    findUnique: jest.Mock;
  };
};

// ── Generator ────────────────────────────────────────────────────────────────
// Generate realistic Stellar-like secret key strings: alphanumeric strings
// starting with 'S', between 10 and 56 characters. These are long enough to
// be meaningful and won't produce false positives against JSON structure chars.

const stellarSecretKeyArb = fc
  .stringMatching(/^S[A-Z0-9]{9,55}$/)
  .filter((s) => s.length >= 10);

describe('WalletService — Property Tests', () => {
  // Feature: stellar-pay, Property 8: Secret key never exposed in API responses or database plaintext

  describe('Property 8: Secret key never exposed in API responses or database plaintext', () => {
    // Feature: stellar-pay, Property 8: Secret key never exposed in API responses or database plaintext
    it('createWallet return value does not contain the secret key', async () => {
      /**
       * Validates: Requirements 2.1, 2.4, 2.7
       *
       * For any random secret key string, after calling createWallet the
       * returned object must not contain the secret key in any field.
       */
      await fc.assert(
        fc.asyncProperty(stellarSecretKeyArb, async (randomSecretKey) => {
          // Clear mocks between iterations to avoid state leaking
          jest.clearAllMocks();

          const publicKey = 'G' + 'A'.repeat(55);

          // StellarService returns our random secret key
          mockGenerateKeypair.mockReturnValue({
            publicKey,
            secretKey: randomSecretKey,
          });
          mockFundAccount.mockResolvedValue(undefined);

          // EncryptionService transforms the input so we can verify
          // the stored value differs from the plaintext
          mockEncrypt.mockReturnValue({
            ciphertext: `enc_${Buffer.from(randomSecretKey).toString('hex')}`,
            iv: 'mock_iv_hex',
            authTag: 'mock_auth_tag_hex',
          });

          mockPrisma.wallet.create.mockResolvedValue({
            id: 'wallet-id',
            userId: 'user-id',
            stellarAddress: publicKey,
          });

          const result = await createWallet('user-id');

          // The result must not contain the secret key
          const resultJson = JSON.stringify(result);
          expect(resultJson).not.toContain(randomSecretKey);

          // The result should only have publicKey
          expect(result).toEqual({ publicKey });
          expect(result).not.toHaveProperty('secretKey');

          return true;
        }),
        { numRuns: 20 }
      );
    });

    // Feature: stellar-pay, Property 8: Secret key never exposed in API responses or database plaintext
    it('createWallet stores only ciphertext (not plaintext secret key) in the database', async () => {
      /**
       * Validates: Requirements 2.1, 2.4, 2.7
       *
       * For any random secret key string, the Prisma wallet.create call
       * should receive ciphertext that differs from the plaintext key,
       * and the plaintext key should not appear in any stored field.
       */
      await fc.assert(
        fc.asyncProperty(stellarSecretKeyArb, async (randomSecretKey) => {
          // Clear mocks between iterations
          jest.clearAllMocks();

          const publicKey = 'G' + 'A'.repeat(55);
          const ciphertext = `enc_${Buffer.from(randomSecretKey).toString('hex')}`;

          mockGenerateKeypair.mockReturnValue({
            publicKey,
            secretKey: randomSecretKey,
          });
          mockFundAccount.mockResolvedValue(undefined);

          mockEncrypt.mockReturnValue({
            ciphertext,
            iv: 'mock_iv_hex',
            authTag: 'mock_auth_tag_hex',
          });

          mockPrisma.wallet.create.mockResolvedValue({
            id: 'wallet-id',
            userId: 'user-id',
            stellarAddress: publicKey,
          });

          await createWallet('user-id');

          // Verify Prisma was called exactly once in this iteration
          expect(mockPrisma.wallet.create).toHaveBeenCalledTimes(1);

          const createCall = mockPrisma.wallet.create.mock.calls[0][0];
          const storedData = createCall.data;

          // The stored encryptedSecretKey must NOT be the plaintext
          expect(storedData.encryptedSecretKey).not.toBe(randomSecretKey);

          // The stored encryptedSecretKey should be the ciphertext
          expect(storedData.encryptedSecretKey).toBe(ciphertext);

          // No field in the stored data should contain the plaintext secret key
          const storedJson = JSON.stringify(storedData);
          expect(storedJson).not.toContain(randomSecretKey);

          return true;
        }),
        { numRuns: 20 }
      );
    });

    // Feature: stellar-pay, Property 8: Secret key never exposed in API responses or database plaintext
    it('getWalletDetails does not return any secret key material', async () => {
      /**
       * Validates: Requirements 2.1, 2.4, 2.7
       *
       * For any random secret key and its encrypted form, getWalletDetails
       * should return only the Stellar address and balance — neither the
       * plaintext secret key nor the ciphertext should appear in the response.
       */
      await fc.assert(
        fc.asyncProperty(stellarSecretKeyArb, async (randomSecretKey) => {
          // Clear mocks between iterations
          jest.clearAllMocks();

          const publicKey = 'G' + 'A'.repeat(55);
          const ciphertext = `enc_${Buffer.from(randomSecretKey).toString('hex')}`;

          // Simulate the DB returning only the stellarAddress (as the real
          // implementation uses select: { stellarAddress: true })
          mockPrisma.wallet.findUnique.mockResolvedValue({
            stellarAddress: publicKey,
          });

          mockGetBalance.mockResolvedValue('10000.0000000');

          const result = await getWalletDetails('user-id');

          // The result must not contain the plaintext secret key
          const resultJson = JSON.stringify(result);
          expect(resultJson).not.toContain(randomSecretKey);

          // The result must not contain the ciphertext either
          expect(resultJson).not.toContain(ciphertext);

          // The result should only have stellarAddress and balance
          expect(result).toEqual({
            stellarAddress: publicKey,
            balance: '10000.0000000',
          });
          expect(result).not.toHaveProperty('secretKey');
          expect(result).not.toHaveProperty('encryptedSecretKey');

          return true;
        }),
        { numRuns: 20 }
      );
    });
  });
});
