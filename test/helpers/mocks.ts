/**
 * Mock stubs for service classes used across tests.
 *
 * Each mock factory returns an object with all public methods stubbed as jest.fn().
 * Tests can configure individual return values as needed.
 */

import { jest } from '@jest/globals';

// ── StellarService Mock ─────────────────────────────────────────────────

export function createMockStellarService() {
  return {
    generateKeypair: jest.fn<() => { publicKey: string; secretKey: string }>().mockReturnValue({
      publicKey: `G${'A'.repeat(55)}`,
      secretKey: `S${'B'.repeat(55)}`,
    }),
    fundAccount: jest.fn<(publicKey: string) => Promise<void>>().mockResolvedValue(undefined),
    getBalance: jest.fn<(publicKey: string) => Promise<string>>().mockResolvedValue('10000.0000000'),
    submitPayment: jest.fn<
      (senderSecret: string, recipientPublic: string, amount: string, memo?: string) => Promise<{ transactionId: string }>
    >().mockResolvedValue({ transactionId: 'mock_stellar_tx_id' }),
    streamPayments: jest.fn<(publicKey: string, onPayment: unknown) => void>(),
  };
}

// ── EncryptionService Mock ──────────────────────────────────────────────

export function createMockEncryptionService() {
  return {
    encrypt: jest.fn<
      (plaintext: string) => { ciphertext: string; iv: string; authTag: string }
    >().mockReturnValue({
      ciphertext: 'mock_ciphertext',
      iv: 'mock_iv',
      authTag: 'mock_auth_tag',
    }),
    decrypt: jest.fn<
      (ciphertext: string, iv: string, authTag: string) => string
    >().mockReturnValue('mock_decrypted_secret'),
  };
}

// ── PINService Mock ─────────────────────────────────────────────────────

export function createMockPINService() {
  return {
    setPin: jest.fn<(userId: string, pin: string) => Promise<void>>().mockResolvedValue(undefined),
    verifyPin: jest.fn<(userId: string, pin: string) => Promise<boolean>>().mockResolvedValue(true),
    isLocked: jest.fn<(userId: string) => Promise<boolean>>().mockResolvedValue(false),
    resetPin: jest.fn<(userId: string, newPin: string) => Promise<void>>().mockResolvedValue(undefined),
  };
}

// ── AuthService Mock ────────────────────────────────────────────────────

export function createMockAuthService() {
  return {
    register: jest.fn<(data: Record<string, unknown>) => Promise<{ user: Record<string, unknown>; token: string }>>()
      .mockResolvedValue({ user: { id: 'mock_user_id' }, token: 'mock_jwt_token' }),
    login: jest.fn<(data: Record<string, unknown>) => Promise<{ token: string; user: Record<string, unknown> }>>()
      .mockResolvedValue({ token: 'mock_jwt_token', user: { id: 'mock_user_id' } }),
    validateToken: jest.fn<(token: string) => { userId: string; role: string }>()
      .mockReturnValue({ userId: 'mock_user_id', role: 'USER' }),
  };
}

// ── WalletService Mock ──────────────────────────────────────────────────

export function createMockWalletService() {
  return {
    createWallet: jest.fn<(userId: string) => Promise<{ publicKey: string }>>()
      .mockResolvedValue({ publicKey: `G${'A'.repeat(55)}` }),
    getWalletDetails: jest.fn<(userId: string) => Promise<{ stellarAddress: string; balance: string }>>()
      .mockResolvedValue({ stellarAddress: `G${'A'.repeat(55)}`, balance: '10000.0000000' }),
    decryptSecretKey: jest.fn<(userId: string) => Promise<string>>()
      .mockResolvedValue('mock_decrypted_secret'),
  };
}

// ── PaymentService Mock ─────────────────────────────────────────────────

export function createMockPaymentService() {
  return {
    sendPayment: jest.fn<(data: Record<string, unknown>) => Promise<{ transaction: { id: string } }>>()
      .mockResolvedValue({ transaction: { id: 'mock_tx_id' } }),
    resolveRecipient: jest.fn<(identifier: string) => Promise<{ stellarAddress: string }>>()
      .mockResolvedValue({ stellarAddress: `G${'C'.repeat(55)}` }),
    getTransactionHistory: jest.fn<(userId: string, filters?: Record<string, unknown>) => Promise<{ transactions: unknown[]; pagination: { page: number; total: number } }>>()
      .mockResolvedValue({ transactions: [], pagination: { page: 1, total: 0 } }),
  };
}

// ── ContactService Mock ─────────────────────────────────────────────────

export function createMockContactService() {
  return {
    createContact: jest.fn<(userId: string, data: Record<string, unknown>) => Promise<{ contact: { id: string } }>>()
      .mockResolvedValue({ contact: { id: 'mock_contact_id' } }),
    listContacts: jest.fn<(userId: string) => Promise<unknown[]>>().mockResolvedValue([]),
    updateContact: jest.fn<(userId: string, contactId: string, data: Record<string, unknown>) => Promise<{ contact: { id: string } }>>()
      .mockResolvedValue({ contact: { id: 'mock_contact_id' } }),
    deleteContact: jest.fn<(userId: string, contactId: string) => Promise<void>>().mockResolvedValue(undefined),
  };
}

// ── QRService Mock ──────────────────────────────────────────────────────

export function createMockQRService() {
  return {
    generateStaticQR: jest.fn<(stellarAddress: string) => Promise<Buffer>>()
      .mockResolvedValue(Buffer.from('mock_qr_png')),
    generateDynamicQR: jest.fn<(stellarAddress: string, amount: string, description?: string) => Promise<Buffer>>()
      .mockResolvedValue(Buffer.from('mock_qr_png')),
    parseQRPayload: jest.fn<(data: string) => { address: string; amount?: string; description?: string }>()
      .mockReturnValue({ address: `G${'A'.repeat(55)}` }),
  };
}

// ── NotificationService Mock ────────────────────────────────────────────

export function createMockNotificationService() {
  return {
    subscribe: jest.fn<(userId: string, controller: unknown) => void>(),
    unsubscribe: jest.fn<(userId: string) => void>(),
    notifyPaymentReceived: jest.fn<(userId: string, transaction: unknown) => void>(),
    startHorizonStreaming: jest.fn<() => void>(),
  };
}

// ── AdminService Mock ───────────────────────────────────────────────────

export function createMockAdminService() {
  return {
    getDashboardStats: jest.fn<() => Promise<{ userCount: number; merchantCount: number; txCount: number; volume: string; failedLast24h: number }>>()
      .mockResolvedValue({
      userCount: 0,
      merchantCount: 0,
      txCount: 0,
      volume: '0',
      failedLast24h: 0,
    }),
    listUsers: jest.fn<(page: number, search?: string) => Promise<{ users: unknown[]; pagination: { page: number; total: number } }>>()
      .mockResolvedValue({ users: [], pagination: { page: 1, total: 0 } }),
    setAccountStatus: jest.fn<(userId: string, status: string) => Promise<void>>().mockResolvedValue(undefined),
  };
}
