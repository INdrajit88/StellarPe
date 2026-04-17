/**
 * POST /api/qr/dynamic — Generate a dynamic QR code with amount and description.
 *
 * Encodes the Merchant's Stellar address, amount, and optional description
 * into a PNG QR code image. The Merchant's wallet address is fetched from
 * WalletService, then passed to QRService.generateDynamicQR.
 *
 * Requires JWT authentication (handled by Edge middleware which sets
 * x-user-id and x-user-role headers). Accessible only by the MERCHANT role.
 *
 * Middleware stack:
 * 1. JWT auth (Edge middleware — x-user-id / x-user-role headers)
 * 2. CSRF validation (POST is state-mutating)
 * 3. Role guard (MERCHANT only)
 * 4. Zod validation (dynamicQRSchema)
 *
 * Returns the PNG image with Content-Type: image/png.
 *
 * Error mapping:
 * - 400: Validation failure or invalid JSON
 * - 403: CSRF missing or role not authorized
 * - 404: No wallet found for merchant
 * - 500: Unexpected server error
 *
 * @see Requirements 7.2 (dynamic QR with address + amount + description),
 *      7.3 (PNG ≥256×256), 13.7 (CSRF)
 */

import { getWalletDetails } from '@/lib/services/wallet.service';
import { generateDynamicQR } from '@/lib/services/qr.service';
import { dynamicQRSchema } from '@/lib/validators/qr.validator';
import { validateRequest } from '@/lib/middleware/validator';
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
    const userId = request.headers.get('x-user-id');
    const userRole = request.headers.get('x-user-role');

    // Step 3: Role guard — only MERCHANT can generate dynamic QR codes.
    const roleGuard = requireRole('MERCHANT');
    const roleError = roleGuard(userRole);
    if (roleError) {
      return roleError;
    }

    // Step 4: Parse and validate the request body with Zod.
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { error: 'Invalid JSON in request body.' },
        { status: 400 },
      );
    }

    const validation = validateRequest(dynamicQRSchema, body);
    if (validation.error) {
      return validation.error;
    }

    // Step 5: Fetch the merchant's wallet to get their Stellar address.
    const walletDetails = await getWalletDetails(userId!);

    // Step 6: Generate the dynamic QR code PNG.
    const qrBuffer = await generateDynamicQR(
      walletDetails.stellarAddress,
      String(validation.data.amount),
      validation.data.description,
    );

    // Step 7: Return the PNG image with proper content-type header.
    return new Response(new Uint8Array(qrBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(qrBuffer.length),
      },
    });
  } catch (error: unknown) {
    // Handle "no wallet found" errors as 404.
    if (error instanceof Error && error.message.includes('No wallet found')) {
      return Response.json(
        { error: 'No wallet found for this account.' },
        { status: 404 },
      );
    }

    // Unexpected error — do not leak internal details.
    console.error('Dynamic QR generation error:', error);
    return Response.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 },
    );
  }
}
