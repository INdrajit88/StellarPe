/**
 * Unit tests for QRService.
 *
 * Tests QR code generation (static and dynamic) and QR payload parsing
 * with Stellar address validation.
 *
 * @see Requirements 7.1, 7.2, 7.3, 7.5, 7.6
 */

import { jest } from '@jest/globals';

// ─── Mock setup ──────────────────────────────────────────────────────────────

const mockToBuffer = jest.fn();

jest.mock('qrcode', () => ({
  __esModule: true,
  default: {
    toBuffer: (...args: unknown[]) => mockToBuffer(...args),
  },
}));

// Import the module under test — mocks are already in place
import {
  generateStaticQR,
  generateDynamicQR,
  parseQRPayload,
} from '../qr.service';

// ─── Test Data ───────────────────────────────────────────────────────────────

// Valid 56-char Stellar public key (starts with G, valid base32 chars A-Z, 2-7)
const VALID_ADDRESS = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV2';

// A fake PNG buffer returned by the mock
const FAKE_PNG_BUFFER = Buffer.from('fake-png-data');

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockToBuffer.mockResolvedValue(FAKE_PNG_BUFFER);
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('QRService', () => {
  describe('generateStaticQR()', () => {
    it('returns a Buffer for a valid Stellar address', async () => {
      const result = await generateStaticQR(VALID_ADDRESS);
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it('encodes a JSON payload with only the address field', async () => {
      await generateStaticQR(VALID_ADDRESS);

      const expectedPayload = JSON.stringify({ address: VALID_ADDRESS });
      expect(mockToBuffer).toHaveBeenCalledWith(
        expectedPayload,
        expect.objectContaining({ type: 'png', width: 256 })
      );
    });

    it('uses PNG format with minimum 256px width', async () => {
      await generateStaticQR(VALID_ADDRESS);

      expect(mockToBuffer).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          type: 'png',
          width: 256,
        })
      );
    });

    it('throws for an invalid Stellar address (too short)', async () => {
      await expect(generateStaticQR('GABC')).rejects.toThrow(
        /Invalid Stellar address/
      );
    });

    it('throws for an address not starting with G', async () => {
      const badAddress = 'A' + VALID_ADDRESS.slice(1);
      await expect(generateStaticQR(badAddress)).rejects.toThrow(
        /Invalid Stellar address/
      );
    });

    it('throws for an address with invalid base32 characters', async () => {
      // Replace a valid char with '1' which is not in base32 (A-Z, 2-7)
      const badAddress = VALID_ADDRESS.slice(0, 10) + '1' + VALID_ADDRESS.slice(11);
      await expect(generateStaticQR(badAddress)).rejects.toThrow(
        /Invalid Stellar address/
      );
    });

    it('throws for an empty string', async () => {
      await expect(generateStaticQR('')).rejects.toThrow(
        /Invalid Stellar address/
      );
    });
  });

  describe('generateDynamicQR()', () => {
    it('returns a Buffer for valid inputs', async () => {
      const result = await generateDynamicQR(VALID_ADDRESS, '10.5');
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it('encodes address and amount in the JSON payload', async () => {
      await generateDynamicQR(VALID_ADDRESS, '25.0');

      const expectedPayload = JSON.stringify({
        address: VALID_ADDRESS,
        amount: '25.0',
      });
      expect(mockToBuffer).toHaveBeenCalledWith(
        expectedPayload,
        expect.objectContaining({ type: 'png', width: 256 })
      );
    });

    it('includes description in the payload when provided', async () => {
      await generateDynamicQR(VALID_ADDRESS, '10', 'Coffee payment');

      const expectedPayload = JSON.stringify({
        address: VALID_ADDRESS,
        amount: '10',
        description: 'Coffee payment',
      });
      expect(mockToBuffer).toHaveBeenCalledWith(
        expectedPayload,
        expect.objectContaining({ type: 'png', width: 256 })
      );
    });

    it('omits description from payload when not provided', async () => {
      await generateDynamicQR(VALID_ADDRESS, '5');

      const expectedPayload = JSON.stringify({
        address: VALID_ADDRESS,
        amount: '5',
      });
      expect(mockToBuffer).toHaveBeenCalledWith(expectedPayload, expect.any(Object));
    });

    it('throws for an invalid Stellar address', async () => {
      await expect(generateDynamicQR('INVALID', '10')).rejects.toThrow(
        /Invalid Stellar address/
      );
    });

    it('uses PNG format with minimum 256px width', async () => {
      await generateDynamicQR(VALID_ADDRESS, '10');

      expect(mockToBuffer).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          type: 'png',
          width: 256,
        })
      );
    });
  });

  describe('parseQRPayload()', () => {
    it('parses a valid static QR payload (address only)', () => {
      const data = JSON.stringify({ address: VALID_ADDRESS });
      const result = parseQRPayload(data);

      expect(result).toEqual({ address: VALID_ADDRESS });
    });

    it('parses a valid dynamic QR payload with amount', () => {
      const data = JSON.stringify({
        address: VALID_ADDRESS,
        amount: '50.5',
      });
      const result = parseQRPayload(data);

      expect(result).toEqual({
        address: VALID_ADDRESS,
        amount: '50.5',
      });
    });

    it('parses a valid dynamic QR payload with amount and description', () => {
      const data = JSON.stringify({
        address: VALID_ADDRESS,
        amount: '10',
        description: 'Monthly subscription',
      });
      const result = parseQRPayload(data);

      expect(result).toEqual({
        address: VALID_ADDRESS,
        amount: '10',
        description: 'Monthly subscription',
      });
    });

    it('ignores extra fields in the payload', () => {
      const data = JSON.stringify({
        address: VALID_ADDRESS,
        amount: '5',
        extra: 'should be ignored',
      });
      const result = parseQRPayload(data);

      expect(result).toEqual({
        address: VALID_ADDRESS,
        amount: '5',
      });
      expect(result).not.toHaveProperty('extra');
    });

    it('throws for non-JSON data', () => {
      expect(() => parseQRPayload('not-json')).toThrow(
        /not valid JSON/
      );
    });

    it('throws for a JSON array instead of an object', () => {
      expect(() => parseQRPayload('[1, 2, 3]')).toThrow(
        /expected a JSON object/
      );
    });

    it('throws for a JSON string instead of an object', () => {
      expect(() => parseQRPayload('"just a string"')).toThrow(
        /expected a JSON object/
      );
    });

    it('throws for a JSON null', () => {
      expect(() => parseQRPayload('null')).toThrow(
        /expected a JSON object/
      );
    });

    it('throws when the address field is missing', () => {
      const data = JSON.stringify({ amount: '10' });
      expect(() => parseQRPayload(data)).toThrow(
        /missing or invalid "address" field/
      );
    });

    it('throws when the address field is not a string', () => {
      const data = JSON.stringify({ address: 12345 });
      expect(() => parseQRPayload(data)).toThrow(
        /missing or invalid "address" field/
      );
    });

    it('throws for an address that is too short', () => {
      const data = JSON.stringify({ address: 'GABC' });
      expect(() => parseQRPayload(data)).toThrow(
        /Invalid Stellar address in QR payload/
      );
    });

    it('throws for an address that does not start with G', () => {
      const badAddress = 'A' + VALID_ADDRESS.slice(1);
      const data = JSON.stringify({ address: badAddress });
      expect(() => parseQRPayload(data)).toThrow(
        /Invalid Stellar address in QR payload/
      );
    });

    it('throws for an address with invalid base32 characters', () => {
      const badAddress = VALID_ADDRESS.slice(0, 5) + '0' + VALID_ADDRESS.slice(6);
      const data = JSON.stringify({ address: badAddress });
      expect(() => parseQRPayload(data)).toThrow(
        /Invalid Stellar address in QR payload/
      );
    });

    it('throws for an address that is too long', () => {
      const longAddress = VALID_ADDRESS + 'EXTRA';
      const data = JSON.stringify({ address: longAddress });
      expect(() => parseQRPayload(data)).toThrow(
        /Invalid Stellar address in QR payload/
      );
    });

    it('does not include amount if it is not a string', () => {
      const data = JSON.stringify({
        address: VALID_ADDRESS,
        amount: 100,
      });
      const result = parseQRPayload(data);
      expect(result).toEqual({ address: VALID_ADDRESS });
      expect(result).not.toHaveProperty('amount');
    });

    it('does not include description if it is not a string', () => {
      const data = JSON.stringify({
        address: VALID_ADDRESS,
        description: true,
      });
      const result = parseQRPayload(data);
      expect(result).toEqual({ address: VALID_ADDRESS });
      expect(result).not.toHaveProperty('description');
    });
  });
});
