/**
 * Test data factories for creating mock domain objects.
 *
 * Each factory returns a plain object matching the Prisma model shape.
 * Override any field via the optional `overrides` parameter.
 */

// Re-define enums as plain values to avoid importing the generated Prisma client
// (which requires a DB adapter). These mirror the enums in prisma/schema.prisma.
const Role = { USER: 'USER', MERCHANT: 'MERCHANT', ADMIN: 'ADMIN' } as const;
const AccountStatus = { ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE' } as const;
const TransactionStatus = { COMPLETED: 'COMPLETED', FAILED: 'FAILED' } as const;

type Role = (typeof Role)[keyof typeof Role];
type AccountStatus = (typeof AccountStatus)[keyof typeof AccountStatus];
type TransactionStatus = (typeof TransactionStatus)[keyof typeof TransactionStatus];

// ── Shared counter for generating unique IDs ────────────────────────────
let idCounter = 0;
function nextId(prefix = 'test'): string {
  idCounter += 1;
  return `${prefix}_${idCounter}`;
}

/** Reset the ID counter – useful in beforeEach hooks. */
export function resetIdCounter(): void {
  idCounter = 0;
}

// ── User Factory ────────────────────────────────────────────────────────

export interface UserData {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  role: Role;
  status: AccountStatus;
  pinHash: string | null;
  failedPinAttempts: number;
  pinLockedUntil: Date | null;
  failedLoginAttempts: number;
  loginLockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function buildUser(overrides: Partial<UserData> = {}): UserData {
  const id = overrides.id ?? nextId('user');
  return {
    id,
    username: `user_${id}`,
    email: `${id}@test.com`,
    passwordHash: '$2b$12$hashedpasswordplaceholder',
    role: Role.USER,
    status: AccountStatus.ACTIVE,
    pinHash: null,
    failedPinAttempts: 0,
    pinLockedUntil: null,
    failedLoginAttempts: 0,
    loginLockedUntil: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

// ── Wallet Factory ──────────────────────────────────────────────────────

export interface WalletData {
  id: string;
  userId: string;
  stellarAddress: string;
  encryptedSecretKey: string;
  encryptionIV: string;
  authTag: string;
  createdAt: Date;
}

export function buildWallet(overrides: Partial<WalletData> = {}): WalletData {
  const id = overrides.id ?? nextId('wallet');
  return {
    id,
    userId: overrides.userId ?? nextId('user'),
    stellarAddress: `G${'A'.repeat(55)}`, // 56-char placeholder
    encryptedSecretKey: 'encrypted_secret_placeholder',
    encryptionIV: 'iv_placeholder',
    authTag: 'tag_placeholder',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

// ── Transaction Factory ─────────────────────────────────────────────────

export interface TransactionData {
  id: string;
  stellarTxId: string | null;
  senderAddress: string;
  recipientAddress: string;
  senderId: string | null;
  recipientId: string | null;
  amount: number | string;
  memo: string | null;
  status: TransactionStatus;
  errorReason: string | null;
  createdAt: Date;
}

export function buildTransaction(
  overrides: Partial<TransactionData> = {},
): TransactionData {
  const id = overrides.id ?? nextId('tx');
  return {
    id,
    stellarTxId: `stellar_${id}`,
    senderAddress: `G${'B'.repeat(55)}`,
    recipientAddress: `G${'C'.repeat(55)}`,
    senderId: null,
    recipientId: null,
    amount: 10.0,
    memo: null,
    status: TransactionStatus.COMPLETED,
    errorReason: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

// ── Contact Factory ─────────────────────────────────────────────────────

export interface ContactData {
  id: string;
  userId: string;
  displayName: string;
  stellarAddress: string | null;
  username: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export function buildContact(overrides: Partial<ContactData> = {}): ContactData {
  const id = overrides.id ?? nextId('contact');
  return {
    id,
    userId: overrides.userId ?? nextId('user'),
    displayName: `Contact ${id}`,
    stellarAddress: `G${'D'.repeat(55)}`,
    username: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}
