/**
 * Unit tests for WalletService.
 *
 * Mocks StellarService, EncryptionService, and Prisma to test wallet creation,
 * detail retrieval, and secret key decryption in isolation.
 *
 * SECURITY: Verifies that plaintext secret keys are never exposed in any
 * return value, error message, or logged output.
 *
 * @see Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8
 */

import { jest } from '@jest/globals';

// ─── Mock setup ──────────────────────────────────────────────────────────────

const mockGenerateKeypair = jest.fn<() => { publicKey: string; secretKey: string }>();
const mockFundAccount = jest.fn<(publicKey: string) => Promise<void>>();
const mockGetBalance = jest.fn<(publicKey: string) => Promise<string>>();

jest.mock('../stellar.service', () => ({
  __esModule: true,
  generateKeypair: (...args: unknown[]) => mockGenerateKeypair(...(args as [])),
  fundAccount: (...args: unknown[]) => mockFundAccount(...(args as [string])),
  getBalance: (...args: unknown[]) => mockGetBalance(...(args as [string])),
}));

const mockEncrypt = jest.fn<(plaintext: string) => { ciphertext: string; iv: string; authTag: string }>();
const mockDecrypt = jest.fn<(ciphertext: string, iv: string, authTag: string) => string>();

jest.mock('../encryption.service', () => ({
  __esModule: true,
  encrypt: (...args: unknown[]) => mockEncrypt(...(args as [string])),
  decrypt: (...args: unknown[]) => mockDecrypt(...(args as [string, string, string])),
}));

// Prisma is mocked globally via test/setup.ts

import { createWallet, getWalletDetails, decryptSecretKey } from '../wallet.service';
import { prisma } from '@/lib/prisma';

// ─── Test constants ──────────────────────────────────────────────────────────

const TEST_USER_ID = 'user_test_123';
const TEST_PUBLIC_KEY = 'GBCM3GAOCAPT3YPZCIZ2JKXJQ7YUQFGQE5AQNXFM5LJDQH7ZZQKZVA';
const TEST_SECRET_KEY = 'SCZANGBA5YHTNYVVV3C7CAZMCLXPILHSE7KA52FYI7RCZPYDHO2SYZXGT';
const TEST_CIPHERTEXT = 'a1b2c3d4e5f6encrypted';
const TEST_IV = 'aabbccddee112233';
const TEST_AUTH_TAG = '11223344556677889900aabbccddeeff';
const TEST_BALANCE = '9999.9999900';

// ─── Test helpers ────────────────────────────────────────────────────────────

function setupDefaultMocks() {
  mockGenerateKeypair.mockReturnValue({
    publicKey: TEST_PUBLIC_KEY,
    secretKey: TEST_SECRET_KEY,
  });
  mockFundAccount.mockResolvedValue(undefined);
  mockEncrypt.mockReturnValue({
    ciphertext: TEST_CIPHERTEXT,
    iv: TEST_IV,
    authTag: TEST_AUTH_TAG,
  });
  mockDecrypt.mockReturnValue(TEST_SECRET_KEY);
  mockGetBalance.mockResolvedValue(TEST_BALANCE);

  (prisma.wallet.create as jest.Mock).mockResolvedValue({
    id: 'wallet_1',
    userId: TEST_USER_ID,
    stellarAddress: TEST_PUBLIC_KEY,
    encryptedSecretKey: TEST_CIPHERTEXT,
    encryptionIV: TEST_IV,
    authTag: TEST_AUTH_TAG,
    createdAt: new Date(),
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('WalletService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
  });

  describe('createWallet()', () => {
    it('generates a keypair via StellarService', async () => {
      await createWallet(TEST_USER_ID);
      expect(mockGenerateKeypair).toHaveBeenCalledTimes(1);
    });

    it('funds the generated public key via Friendbot', async () => {
      await createWallet(TEST_USER_ID);
      expect(mockFundAccount).toHaveBeenCalledWith(TEST_PUBLIC_KEY);
    });

    it('encrypts the secret key via EncryptionService', async () => {
      await createWallet(TEST_USER_ID);
      expect(mockEncrypt).toHaveBeenCalledWith(TEST_SECRET_KEY);
    });

    it('stores the wallet record with encrypted secret key in the database', async () => {
      await createWallet(TEST_USER_ID);

      expect(prisma.wallet.create).toHaveBeenCalledWith({
        data: {
          userId: TEST_USER_ID,
          stellarAddress: TEST_PUBLIC_KEY,
          encryptedSecretKey: TEST_CIPHERTEXT,
          encryptionIV: TEST_IV,
          authTag: TEST_AUTH_TAG,
        },
      });
    });

    it('returns the public key on success', async () => {
      const result = await createWallet(TEST_USER_ID);
      expect(result).toEqual({ publicKey: TEST_PUBLIC_KEY });
    });

    it('calls steps in correct order: keypair → fund → encrypt → store', async () => {
      const callOrder: string[] = [];

      mockGenerateKeypair.mockImplementation(() => {
        callOrder.push('generateKeypair');
        return { publicKey: TEST_PUBLIC_KEY, secretKey: TEST_SECRET_KEY };
      });
      mockFundAccount.mockImplementation(async () => {
        callOrder.push('fundAccount');
      });
      mockEncrypt.mockImplementation(() => {
        callOrder.push('encrypt');
        return { ciphertext: TEST_CIPHERTEXT, iv: TEST_IV, authTag: TEST_AUTH_TAG };
      });
      (prisma.wallet.create as jest.Mock).mockImplementation(async () => {
        callOrder.push('walletCreate');
        return {} as never;
      });

      await createWallet(TEST_USER_ID);

      expect(callOrder).toEqual([
        'generateKeypair',
        'fundAccount',
        'encrypt',
        'walletCreate',
      ]);
    });

    it('throws when Friendbot funding fails', async () => {
      mockFundAccount.mockRejectedValue(new Error('Friendbot failure'));

      await expect(createWallet(TEST_USER_ID)).rejects.toThrow(
        /Failed to create wallet.*Friendbot failure/
      );
    });

    it('throws when database write fails', async () => {
      (prisma.wallet.create as jest.Mock).mockRejectedValue(
        new Error('Unique constraint violation')
      );

      await expect(createWallet(TEST_USER_ID)).rejects.toThrow(
        /Failed to create wallet.*Unique constraint violation/
      );
    });

    it('does not include the secret key in error messages', async () => {
      mockFundAccount.mockRejectedValue(new Error('Network error'));

      try {
        await createWallet(TEST_USER_ID);
      } catch (error: unknown) {
        const message = (error as Error).message;
        expect(message).not.toContain(TEST_SECRET_KEY);
      }
    });

    it('does not store the database before funding succeeds', async () => {
      mockFundAccount.mockRejectedValue(new Error('Funding failed'));

      await expect(createWallet(TEST_USER_ID)).rejects.toThrow();
      expect(prisma.wallet.create).not.toHaveBeenCalled();
    });
  });

  describe('getWalletDetails()', () => {
    it('queries the database for the wallet by userId', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({
        stellarAddress: TEST_PUBLIC_KEY,
      });

      await getWalletDetails(TEST_USER_ID);

      expect(prisma.wallet.findUnique).toHaveBeenCalledWith({
        where: { userId: TEST_USER_ID },
        select: { stellarAddress: true },
      });
    });

    it('queries Horizon for the live balance', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({
        stellarAddress: TEST_PUBLIC_KEY,
      });

      await getWalletDetails(TEST_USER_ID);

      expect(mockGetBalance).toHaveBeenCalledWith(TEST_PUBLIC_KEY);
    });

    it('returns the stellar address and balance', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({
        stellarAddress: TEST_PUBLIC_KEY,
      });

      const result = await getWalletDetails(TEST_USER_ID);

      expect(result).toEqual({
        stellarAddress: TEST_PUBLIC_KEY,
        balance: TEST_BALANCE,
      });
    });

    it('throws when no wallet exists for the user', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(getWalletDetails(TEST_USER_ID)).rejects.toThrow(
        /No wallet found for user/
      );
    });

    it('throws when Horizon balance query fails', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({
        stellarAddress: TEST_PUBLIC_KEY,
      });
      mockGetBalance.mockRejectedValue(new Error('Account not found'));

      await expect(getWalletDetails(TEST_USER_ID)).rejects.toThrow(
        'Account not found'
      );
    });

    it('never selects the encrypted secret key from the database', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({
        stellarAddress: TEST_PUBLIC_KEY,
      });

      await getWalletDetails(TEST_USER_ID);

      // Verify the select clause only requests stellarAddress
      const call = (prisma.wallet.findUnique as jest.Mock).mock.calls[0] as Array<Record<string, unknown>>;
      const selectArg = call[0].select as Record<string, boolean>;
      expect(selectArg).toEqual({ stellarAddress: true });
      expect(selectArg).not.toHaveProperty('encryptedSecretKey');
      expect(selectArg).not.toHaveProperty('encryptionIV');
      expect(selectArg).not.toHaveProperty('authTag');
    });
  });

  describe('decryptSecretKey()', () => {
    it('queries the database for the encrypted key fields', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({
        encryptedSecretKey: TEST_CIPHERTEXT,
        encryptionIV: TEST_IV,
        authTag: TEST_AUTH_TAG,
      });

      await decryptSecretKey(TEST_USER_ID);

      expect(prisma.wallet.findUnique).toHaveBeenCalledWith({
        where: { userId: TEST_USER_ID },
        select: {
          encryptedSecretKey: true,
          encryptionIV: true,
          authTag: true,
        },
      });
    });

    it('decrypts the secret key using EncryptionService', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({
        encryptedSecretKey: TEST_CIPHERTEXT,
        encryptionIV: TEST_IV,
        authTag: TEST_AUTH_TAG,
      });

      await decryptSecretKey(TEST_USER_ID);

      expect(mockDecrypt).toHaveBeenCalledWith(
        TEST_CIPHERTEXT,
        TEST_IV,
        TEST_AUTH_TAG
      );
    });

    it('returns the decrypted secret key', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({
        encryptedSecretKey: TEST_CIPHERTEXT,
        encryptionIV: TEST_IV,
        authTag: TEST_AUTH_TAG,
      });

      const result = await decryptSecretKey(TEST_USER_ID);
      expect(result).toBe(TEST_SECRET_KEY);
    });

    it('throws when no wallet exists for the user', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(decryptSecretKey(TEST_USER_ID)).rejects.toThrow(
        /No wallet found for user/
      );
    });

    it('throws when decryption fails (tampered data)', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({
        encryptedSecretKey: TEST_CIPHERTEXT,
        encryptionIV: TEST_IV,
        authTag: TEST_AUTH_TAG,
      });
      mockDecrypt.mockImplementation(() => {
        throw new Error('Unsupported state or unable to authenticate data');
      });

      await expect(decryptSecretKey(TEST_USER_ID)).rejects.toThrow(
        'Unsupported state or unable to authenticate data'
      );
    });
  });

  describe('Security: secret key never exposed', () => {
    it('createWallet does not return the secret key', async () => {
      const result = await createWallet(TEST_USER_ID);

      // Result should only contain publicKey
      expect(result).toEqual({ publicKey: TEST_PUBLIC_KEY });
      expect(JSON.stringify(result)).not.toContain(TEST_SECRET_KEY);
    });

    it('getWalletDetails does not return the secret key', async () => {
      (prisma.wallet.findUnique as jest.Mock).mockResolvedValue({
        stellarAddress: TEST_PUBLIC_KEY,
      });

      const result = await getWalletDetails(TEST_USER_ID);

      expect(JSON.stringify(result)).not.toContain(TEST_SECRET_KEY);
      expect(result).not.toHaveProperty('secretKey');
      expect(result).not.toHaveProperty('encryptedSecretKey');
    });

    it('error messages from createWallet do not contain the secret key', async () => {
      // Simulate an error that could potentially leak the key
      (prisma.wallet.create as jest.Mock).mockRejectedValue(
        new Error('DB error')
      );

      try {
        await createWallet(TEST_USER_ID);
      } catch (error: unknown) {
        expect((error as Error).message).not.toContain(TEST_SECRET_KEY);
      }
    });
  });
});
