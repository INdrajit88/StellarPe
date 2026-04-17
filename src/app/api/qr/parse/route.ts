/**
 * POST /api/qr/parse — Parse scanned QR code data.
 *
 * Accepts a JSON payload with the raw QR data string, parses it using
 * QRService.parseQRPayload, and returns the extracted Stellar address,
 * optional amount, and optional description.
 *
 * Requires JWT authentication (handled by Edge middleware which sets
 * x-user-id and x-user-role headers). Accessible only by the USER role.
 *
 * Middleware stack:
 * 1. JWT auth (Edge middleware — x-user-id / x-user-role headers)
 * 2. CSRF validation (POST is state-mutating)
 * 3. Role guard (USER only)
 *
 * Error mapping:
 * - 400: Invalid JSON, missing data field, or malformed QR payload
 * - 403: CSRF missing or role not authorized
 * - 500: Unexpected server error
 *
 * @see Requirements 7.4 (parse scanned QR), 7.5 (malformed QR error),
 *      7.6 (validate 56-char public key), 13.7 (CSRF)
 */

import { parseQRPayload } from '@/lib/services/qr.service';
import { requireRole } from '@/lib/middleware/role-guard';
import { validateCsrf } from '@/lib/middleware/csrf';

export async function POST(request: Request) {
  try {
    // Step 1: CSRF validation — POST is a state-mutating method.
    const csrfError = validateCsrf(request);
    if (csrfError) {
      return csrfError;
    }

    // Step 2: Extract auth context from Edge middleware headers.
    const userRole = request.headers.get('x-user-role');

    // Step 3: Role guard — only USER can parse QR codes.
    const roleGuard = requireRole('USER');
    const roleError = roleGuard(userRole);
    if (roleError) {
      return roleError;
    }

    // Step 4: Parse the request body.
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { error: 'Invalid JSON in request body.' },
        { status: 400 },
      );
    }

    // Step 5: Validate the body contains a 'data' string field.
    if (
      typeof body !== 'object' ||
      body === null ||
      typeof (body as Record<string, unknown>).data !== 'string'
    ) {
      return Response.json(
        { error: 'Request body must contain a "data" field with the QR payload string.' },
        { status: 400 },
      );
    }

    const rawData = (body as Record<string, unknown>).data as string;

    // Step 6: Parse the QR payload using QRService.
    const parsed = parseQRPayload(rawData);

    // Step 7: Return the parsed QR data.
    return Response.json(
      {
        address: parsed.address,
        amount: parsed.amount,
        description: parsed.description,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    // Handle QR parsing errors (invalid payload, bad address, etc.) as 400.
    if (error instanceof Error && error.message.startsWith('Invalid')) {
      return Response.json(
        { error: error.message },
        { status: 400 },
      );
    }

    // Unexpected error — do not leak internal details.
    console.error('QR parse error:', error);
    return Response.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 },
    );
  }
}
