/**
 * Test setup file for Jest.
 *
 * Mocks the Prisma client so unit tests run without a real database connection.
 * The mock is configured via jest.mock and auto-resolves all delegate methods
 * (findUnique, findMany, create, update, delete, etc.) to undefined by default.
 * Individual tests can override specific methods as needed.
 */

import { jest } from '@jest/globals';

// Mock the Prisma singleton so no real DB connection is attempted during tests.
// Each model delegate is a collection of jest.fn() stubs that tests can configure.
jest.mock('../src/lib/prisma', () => {
  const mockPrismaClient = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    wallet: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    transaction: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    contact: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    merchantProfile: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn((fn: unknown) =>
      typeof fn === 'function' ? fn(mockPrismaClient) : fn
    ),
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  };

  return {
    __esModule: true,
    prisma: mockPrismaClient,
  };
});

// Reset all mocks between tests so state doesn't leak across test cases.
beforeEach(() => {
  jest.clearAllMocks();
});
