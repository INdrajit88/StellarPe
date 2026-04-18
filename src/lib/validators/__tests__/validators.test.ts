import {
  registrationSchema,
  loginSchema,
  sendPaymentSchema,
  historyFilterSchema,
  createContactSchema,
  updateContactSchema,
  dynamicQRSchema,
  qrParseSchema,
  setPinSchema,
  resetPinSchema,
  accountStatusUpdateSchema,
  userSearchSchema,
} from '../index';

describe('Auth Validators', () => {
  describe('registrationSchema', () => {
    it('accepts valid registration data', () => {
      const result = registrationSchema.safeParse({
        username: 'john_doe',
        email: 'john@example.com',
        password: 'secureP4ss',
        role: 'USER',
      });
      expect(result.success).toBe(true);
    });

    it('accepts MERCHANT role', () => {
      const result = registrationSchema.safeParse({
        username: 'shop123',
        email: 'shop@example.com',
        password: 'secureP4ss',
        role: 'MERCHANT',
      });
      expect(result.success).toBe(true);
    });

    it('rejects ADMIN role at registration', () => {
      const result = registrationSchema.safeParse({
        username: 'admin_user',
        email: 'admin@example.com',
        password: 'secureP4ss',
        role: 'ADMIN',
      });
      expect(result.success).toBe(false);
    });

    it('rejects short username', () => {
      const result = registrationSchema.safeParse({
        username: 'ab',
        email: 'john@example.com',
        password: 'secureP4ss',
        role: 'USER',
      });
      expect(result.success).toBe(false);
    });

    it('rejects username with special characters', () => {
      const result = registrationSchema.safeParse({
        username: 'john-doe!',
        email: 'john@example.com',
        password: 'secureP4ss',
        role: 'USER',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid email', () => {
      const result = registrationSchema.safeParse({
        username: 'john_doe',
        email: 'notanemail',
        password: 'secureP4ss',
        role: 'USER',
      });
      expect(result.success).toBe(false);
    });

    it('rejects short password', () => {
      const result = registrationSchema.safeParse({
        username: 'john_doe',
        email: 'john@example.com',
        password: 'short',
        role: 'USER',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing fields', () => {
      const result = registrationSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('loginSchema', () => {
    it('accepts valid login data', () => {
      const result = loginSchema.safeParse({
        email: 'john@example.com',
        password: 'secureP4ss',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing password', () => {
      const result = loginSchema.safeParse({
        email: 'john@example.com',
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('Payment Validators', () => {
  describe('sendPaymentSchema', () => {
    it('accepts valid payment with username recipient', () => {
      const result = sendPaymentSchema.safeParse({
        recipient: 'alice',
        amount: 10.5,
        pin: '1234',
      });
      expect(result.success).toBe(true);
    });

    it('accepts payment with memo', () => {
      const result = sendPaymentSchema.safeParse({
        recipient: 'alice',
        amount: 100,
        pin: '123456',
        memo: 'Coffee payment',
      });
      expect(result.success).toBe(true);
    });

    it('rejects negative amount', () => {
      const result = sendPaymentSchema.safeParse({
        recipient: 'alice',
        amount: -5,
        pin: '1234',
      });
      expect(result.success).toBe(false);
    });

    it('rejects zero amount', () => {
      const result = sendPaymentSchema.safeParse({
        recipient: 'alice',
        amount: 0,
        pin: '1234',
      });
      expect(result.success).toBe(false);
    });

    it('rejects amount with more than 7 decimal places', () => {
      const result = sendPaymentSchema.safeParse({
        recipient: 'alice',
        amount: 1.12345678,
        pin: '1234',
      });
      expect(result.success).toBe(false);
    });

    it('accepts amount with exactly 7 decimal places', () => {
      const result = sendPaymentSchema.safeParse({
        recipient: 'alice',
        amount: 1.1234567,
        pin: '1234',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid PIN format', () => {
      const result = sendPaymentSchema.safeParse({
        recipient: 'alice',
        amount: 10,
        pin: '12a',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('historyFilterSchema', () => {
    it('accepts empty filter (all optional)', () => {
      const result = historyFilterSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('accepts full filter set', () => {
      const result = historyFilterSchema.safeParse({
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-12-31T23:59:59Z',
        direction: 'sent',
        status: 'completed',
        page: 1,
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid direction', () => {
      const result = historyFilterSchema.safeParse({
        direction: 'both',
      });
      expect(result.success).toBe(false);
    });
  });
});

describe('Contact Validators', () => {
  describe('createContactSchema', () => {
    const validStellarAddress = 'G' + 'A'.repeat(55);

    it('accepts contact with Stellar address', () => {
      const result = createContactSchema.safeParse({
        displayName: 'Alice',
        stellarAddress: validStellarAddress,
      });
      expect(result.success).toBe(true);
    });

    it('accepts contact with username', () => {
      const result = createContactSchema.safeParse({
        displayName: 'Bob',
        username: 'bob_user',
      });
      expect(result.success).toBe(true);
    });

    it('rejects contact without stellarAddress or username', () => {
      const result = createContactSchema.safeParse({
        displayName: 'Nobody',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty display name', () => {
      const result = createContactSchema.safeParse({
        displayName: '',
        username: 'bob_user',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateContactSchema', () => {
    it('accepts partial update with displayName', () => {
      const result = updateContactSchema.safeParse({
        displayName: 'New Name',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty update', () => {
      const result = updateContactSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});

describe('QR Validators', () => {
  describe('dynamicQRSchema', () => {
    it('accepts valid amount', () => {
      const result = dynamicQRSchema.safeParse({ amount: 50 });
      expect(result.success).toBe(true);
    });

    it('accepts amount with description', () => {
      const result = dynamicQRSchema.safeParse({
        amount: 25.5,
        description: 'Monthly subscription',
      });
      expect(result.success).toBe(true);
    });

    it('rejects zero amount', () => {
      const result = dynamicQRSchema.safeParse({ amount: 0 });
      expect(result.success).toBe(false);
    });
  });

  describe('qrParseSchema', () => {
    const validAddress = 'G' + 'B'.repeat(55);

    it('accepts valid Stellar address', () => {
      const result = qrParseSchema.safeParse({ address: validAddress });
      expect(result.success).toBe(true);
    });

    it('rejects address not starting with G', () => {
      const result = qrParseSchema.safeParse({ address: 'S' + 'B'.repeat(55) });
      expect(result.success).toBe(false);
    });

    it('rejects address with wrong length', () => {
      const result = qrParseSchema.safeParse({ address: 'GABC' });
      expect(result.success).toBe(false);
    });
  });
});

describe('PIN Validators', () => {
  describe('setPinSchema', () => {
    it('accepts 4-digit PIN', () => {
      expect(setPinSchema.safeParse({ pin: '1234' }).success).toBe(true);
    });

    it('accepts 6-digit PIN', () => {
      expect(setPinSchema.safeParse({ pin: '123456' }).success).toBe(true);
    });

    it('rejects 3-digit PIN', () => {
      expect(setPinSchema.safeParse({ pin: '123' }).success).toBe(false);
    });

    it('rejects 7-digit PIN', () => {
      expect(setPinSchema.safeParse({ pin: '1234567' }).success).toBe(false);
    });

    it('rejects PIN with letters', () => {
      expect(setPinSchema.safeParse({ pin: '12ab' }).success).toBe(false);
    });

    it('rejects PIN with special characters', () => {
      expect(setPinSchema.safeParse({ pin: '12!4' }).success).toBe(false);
    });
  });

  describe('resetPinSchema', () => {
    it('accepts valid new PIN', () => {
      expect(resetPinSchema.safeParse({ newPin: '5678' }).success).toBe(true);
    });

    it('rejects invalid new PIN', () => {
      expect(resetPinSchema.safeParse({ newPin: 'abc' }).success).toBe(false);
    });
  });
});

describe('Admin Validators', () => {
  describe('accountStatusUpdateSchema', () => {
    it('accepts ACTIVE status', () => {
      expect(accountStatusUpdateSchema.safeParse({ status: 'ACTIVE' }).success).toBe(true);
    });

    it('accepts INACTIVE status', () => {
      expect(accountStatusUpdateSchema.safeParse({ status: 'INACTIVE' }).success).toBe(true);
    });

    it('rejects invalid status', () => {
      expect(accountStatusUpdateSchema.safeParse({ status: 'BANNED' }).success).toBe(false);
    });
  });

  describe('userSearchSchema', () => {
    it('accepts empty search (all optional)', () => {
      expect(userSearchSchema.safeParse({}).success).toBe(true);
    });

    it('accepts search with query and page', () => {
      expect(userSearchSchema.safeParse({ search: 'john', page: 2 }).success).toBe(true);
    });
  });
});

import {
  deployContractSchema,
  invokeContractSchema,
  simulateContractSchema,
} from '../contract.validator';

describe('Contract Validators', () => {
  describe('deployContractSchema', () => {
    it('accepts valid deploy request with wasmBase64', () => {
      const result = deployContractSchema.safeParse({
        wasmBase64: 'AGFzbQEAAAA=',
      });
      expect(result.success).toBe(true);
    });

    it('accepts deploy request with constructorArgs', () => {
      const result = deployContractSchema.safeParse({
        wasmBase64: 'AGFzbQEAAAA=',
        constructorArgs: ['arg1', 42],
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty wasmBase64', () => {
      const result = deployContractSchema.safeParse({
        wasmBase64: '',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing wasmBase64', () => {
      const result = deployContractSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('accepts deploy request without constructorArgs', () => {
      const result = deployContractSchema.safeParse({
        wasmBase64: 'AGFzbQEAAAA=',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.constructorArgs).toBeUndefined();
      }
    });
  });

  describe('invokeContractSchema', () => {
    it('accepts valid invoke request', () => {
      const result = invokeContractSchema.safeParse({
        contractId: 'CABC123',
        functionName: 'transfer',
        args: ['addr1', 'addr2', 100],
      });
      expect(result.success).toBe(true);
    });

    it('accepts invoke request with subAuth', () => {
      const result = invokeContractSchema.safeParse({
        contractId: 'CABC123',
        functionName: 'swap',
        args: [100],
        subAuth: [
          {
            contractId: 'CTOKEN1',
            functionName: 'transfer',
            args: ['from', 'to', 50],
          },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing contractId', () => {
      const result = invokeContractSchema.safeParse({
        functionName: 'transfer',
        args: [],
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty contractId', () => {
      const result = invokeContractSchema.safeParse({
        contractId: '',
        functionName: 'transfer',
        args: [],
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing functionName', () => {
      const result = invokeContractSchema.safeParse({
        contractId: 'CABC123',
        args: [],
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty functionName', () => {
      const result = invokeContractSchema.safeParse({
        contractId: 'CABC123',
        functionName: '',
        args: [],
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing args', () => {
      const result = invokeContractSchema.safeParse({
        contractId: 'CABC123',
        functionName: 'transfer',
      });
      expect(result.success).toBe(false);
    });

    it('accepts empty args array', () => {
      const result = invokeContractSchema.safeParse({
        contractId: 'CABC123',
        functionName: 'get_balance',
        args: [],
      });
      expect(result.success).toBe(true);
    });

    it('accepts invoke request without subAuth', () => {
      const result = invokeContractSchema.safeParse({
        contractId: 'CABC123',
        functionName: 'transfer',
        args: [100],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.subAuth).toBeUndefined();
      }
    });

    it('rejects subAuth with empty contractId', () => {
      const result = invokeContractSchema.safeParse({
        contractId: 'CABC123',
        functionName: 'swap',
        args: [],
        subAuth: [
          {
            contractId: '',
            functionName: 'transfer',
            args: [],
          },
        ],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('simulateContractSchema', () => {
    it('accepts valid simulate request', () => {
      const result = simulateContractSchema.safeParse({
        contractId: 'CABC123',
        functionName: 'balance',
        args: ['addr1'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing contractId', () => {
      const result = simulateContractSchema.safeParse({
        functionName: 'balance',
        args: [],
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing functionName', () => {
      const result = simulateContractSchema.safeParse({
        contractId: 'CABC123',
        args: [],
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing args', () => {
      const result = simulateContractSchema.safeParse({
        contractId: 'CABC123',
        functionName: 'balance',
      });
      expect(result.success).toBe(false);
    });

    it('accepts empty args array', () => {
      const result = simulateContractSchema.safeParse({
        contractId: 'CABC123',
        functionName: 'get_total_supply',
        args: [],
      });
      expect(result.success).toBe(true);
    });
  });
});
