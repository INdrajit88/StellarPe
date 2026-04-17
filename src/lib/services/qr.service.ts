/**
 * QRService — QR code generation and payload parsing for Stellar payments.
 *
 * Provides server-side QR code generation using the `qrcode` package (PNG format)
 * and QR payload parsing/validation for scanned data.
 *
 * QR payload format is JSON: { address: string, amount?: string, description?: string }
 *
 * - Static QR: encodes only the Stellar address
 * - Dynamic QR: encodes address + amount + optional description
 * - Parser: validates JSON structure and Stellar address format
 *
 * @see Requirements 7.1 (static QR), 7.2 (dynamic QR), 7.3 (PNG ≥256×256),
 *      7.5 (malformed QR error), 7.6 (validate 56-char public key)
 */

import QRCode from 'qrcode';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Minimum QR code width/height in pixels per Requirement 7.3. */
const QR_MIN_SIZE = 256;

/**
 * Regex for valid Stellar public keys:
 * - Exactly 56 characters
 * - Starts with 'G'
 * - Remaining 55 characters are valid base32 (A-Z, 2-7)
 */
const STELLAR_ADDRESS_REGEX = /^G[A-Z2-7]{55}$/;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Validates that a string is a valid Stellar public key address.
 *
 * A valid Stellar address is exactly 56 characters long, starts with 'G',
 * and consists of valid base32 characters (A-Z, 2-7).
 *
 * @param address - The string to validate.
 * @returns true if the address is valid.
 */
function isValidStellarAddress(address: string): boolean {
  return STELLAR_ADDRESS_REGEX.test(address);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Generates a static QR code PNG encoding only the Stellar address.
 *
 * The payload is JSON: `{ "address": "<stellarAddress>" }`
 *
 * @param stellarAddress - The Stellar public key to encode.
 * @returns A Buffer containing the PNG image data (≥256×256 px).
 * @throws Error if the address is invalid or QR generation fails.
 *
 * @see Requirement 7.1 (static QR with address)
 */
export async function generateStaticQR(stellarAddress: string): Promise<Buffer> {
  if (!isValidStellarAddress(stellarAddress)) {
    throw new Error(
      `Invalid Stellar address: must be exactly 56 characters starting with 'G' using valid base32 characters (A-Z, 2-7)`
    );
  }

  const payload = JSON.stringify({ address: stellarAddress });

  // Generate PNG buffer with minimum 256×256 px dimensions.
  // Error correction level 'M' (15% recovery) balances data density with
  // scan reliability on mobile cameras — higher levels increase QR size.
  const buffer = await QRCode.toBuffer(payload, {
    type: 'png',
    width: QR_MIN_SIZE,
    errorCorrectionLevel: 'M',
  });

  return buffer;
}

/**
 * Generates a dynamic QR code PNG encoding the Stellar address, amount,
 * and an optional description.
 *
 * The payload is JSON: `{ "address": "<stellarAddress>", "amount": "<amount>", "description"?: "<description>" }`
 *
 * @param stellarAddress - The Stellar public key to encode.
 * @param amount - The XLM amount as a string (e.g. "10.5").
 * @param description - Optional payment description.
 * @returns A Buffer containing the PNG image data (≥256×256 px).
 * @throws Error if the address is invalid or QR generation fails.
 *
 * @see Requirement 7.2 (dynamic QR with address + amount + description)
 */
export async function generateDynamicQR(
  stellarAddress: string,
  amount: string,
  description?: string
): Promise<Buffer> {
  if (!isValidStellarAddress(stellarAddress)) {
    throw new Error(
      `Invalid Stellar address: must be exactly 56 characters starting with 'G' using valid base32 characters (A-Z, 2-7)`
    );
  }

  const payload: Record<string, string> = {
    address: stellarAddress,
    amount,
  };

  // Only include description in the payload if provided — keeps the QR
  // code data minimal, which improves scan reliability on low-res cameras
  if (description !== undefined) {
    payload.description = description;
  }

  const jsonPayload = JSON.stringify(payload);

  // Generate PNG buffer with minimum 256×256 px dimensions
  const buffer = await QRCode.toBuffer(jsonPayload, {
    type: 'png',
    width: QR_MIN_SIZE,
    errorCorrectionLevel: 'M',
  });

  return buffer;
}

/**
 * Parses and validates a QR code payload string.
 *
 * Expects a JSON string with at minimum an `address` field containing a
 * valid 56-character Stellar public key. Optionally includes `amount` and
 * `description` fields.
 *
 * @param data - The raw string data decoded from a QR code.
 * @returns Parsed payload with address, and optionally amount and description.
 * @throws Error if the data is not valid JSON, missing the address field,
 *         or the address is not a valid Stellar public key.
 *
 * @see Requirement 7.5 (malformed QR error), 7.6 (validate 56-char public key)
 */
export function parseQRPayload(data: string): {
  address: string;
  amount?: string;
  description?: string;
} {
  // Attempt to parse the JSON payload
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    throw new Error('Invalid QR payload: data is not valid JSON');
  }

  // Ensure the parsed data is an object
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Invalid QR payload: expected a JSON object');
  }

  const obj = parsed as Record<string, unknown>;

  // Validate the address field exists and is a string
  if (typeof obj.address !== 'string') {
    throw new Error('Invalid QR payload: missing or invalid "address" field');
  }

  // Validate the Stellar address format: 56 chars, starts with G, valid base32
  if (!isValidStellarAddress(obj.address)) {
    throw new Error(
      `Invalid Stellar address in QR payload: must be exactly 56 characters starting with 'G' using valid base32 characters (A-Z, 2-7)`
    );
  }

  const result: { address: string; amount?: string; description?: string } = {
    address: obj.address,
  };

  // Include amount if present and is a string
  if (typeof obj.amount === 'string') {
    result.amount = obj.amount;
  }

  // Include description if present and is a string
  if (typeof obj.description === 'string') {
    result.description = obj.description;
  }

  return result;
}
