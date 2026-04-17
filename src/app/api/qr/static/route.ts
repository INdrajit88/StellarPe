/**
 * GET /api/qr/static — Generate a static QR code for a Merchant.
 *
 * Encodes the Merchant's Stellar address into a PNG QR code image.
 * The Merchant's wallet address is fetched from WalletService, then
 * passed to QRService.generateStaticQR.
 *
 * Requires JWT authentication (handled by Edge middleware which sets
 * x-user-id and x-user-role headers). Accessible only by the MERCHANT role.
 *
 * Middleware stack:
 * 1. JWT auth (Edge middleware — x-user-id / x-user-role headers)
 * 2. Role guard (MERCHANT only)
 *
 * Returns the PNG image with Content-Type: image/png.
 *
 * Error mapping:
 * - 403: Role not authorized
 * - 404: No wallet found for merchant
 * - 500: Unexpected server error
 *
 * @see Requirements 7.1 (static QR with address), 7.3 (PNG ≥256×256)
 */

import { getWalletDetails } from '@/lib/services/wallet.service';
import { generateStaticQR } from '@/lib/services/qr.service';
import { requireRole } from '@/lib/middleware/role-guard';

export async function GET(request: Request) {
  try {
    // Step 1: Extract auth context from Edge middleware headers.
    const userId = request.headers.get('x-user-id');
    const userRole = request.headers.get('x-user-role');

    // Step 2: Role guard — only MERCHANT can generate static QR codes.
    const roleGuard = requireRole('MERCHANT');
    const roleError = roleGuard(userRole);
    if (roleError) {
      return roleError;
    }

    // Step 3: Fetch the merchant's wallet to get their Stellar address.
    const walletDetails = await getWalletDetails(userId!);

    // Step 4: Generate the static QR code PNG.
    const qrBuffer = await generateStaticQR(walletDetails.stellarAddress);

    // Step 5: Return the PNG image with proper content-type header.
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
    console.error('Static QR generation error:', error);
    return Response.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 },
    );
  }
}
