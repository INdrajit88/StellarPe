/**
 * GET /api/contacts — List all contacts for the authenticated user.
 * POST /api/contacts — Create a new contact.
 *
 * Requires JWT authentication (handled by Edge middleware which sets
 * x-user-id and x-user-role headers). Accessible only by the USER role.
 *
 * Middleware stack (GET):
 * 1. JWT auth (Edge middleware — x-user-id / x-user-role headers)
 * 2. Role guard (USER only)
 *
 * Middleware stack (POST):
 * 1. JWT auth (Edge middleware — x-user-id / x-user-role headers)
 * 2. CSRF validation (POST is state-mutating)
 * 3. Role guard (USER only)
 * 4. Zod validation (createContactSchema)
 *
 * Error mapping:
 * - 400: Validation failure
 * - 403: CSRF missing or role not authorized
 * - 404: Stellar address or username not found
 * - 409: Duplicate contact
 * - 500: Unexpected server error
 *
 * @see Requirements 6.1–6.3, 6.6
 */

import { listContacts, createContact, ContactError } from '@/lib/services/contact.service';
import { createContactSchema } from '@/lib/validators/contact.validator';
import { validateRequest } from '@/lib/middleware/validator';
import { requireRole } from '@/lib/middleware/role-guard';
import { validateCsrf } from '@/lib/middleware/csrf';

export async function GET(request: Request) {
  try {
    // Step 1: Extract auth context from Edge middleware headers.
    const userId = request.headers.get('x-user-id');
    const userRole = request.headers.get('x-user-role');

    // Step 2: Role guard — only USER can manage contacts.
    const roleGuard = requireRole('USER');
    const roleError = roleGuard(userRole);
    if (roleError) {
      return roleError;
    }

    // Step 3: Fetch contacts from ContactService.
    const contacts = await listContacts(userId!);

    // Step 4: Return contacts list.
    return Response.json({ contacts }, { status: 200 });
  } catch (error: unknown) {
    console.error('List contacts error:', error);
    return Response.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 },
    );
  }
}

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

    // Step 3: Role guard — only USER can manage contacts.
    const roleGuard = requireRole('USER');
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

    const validation = validateRequest(createContactSchema, body);
    if (validation.error) {
      return validation.error;
    }

    // Step 5: Delegate to ContactService.createContact.
    const result = await createContact(userId!, {
      displayName: validation.data.displayName,
      stellarAddress: validation.data.stellarAddress,
      username: validation.data.username,
    });

    // Step 6: Return created contact.
    return Response.json({ contact: result.contact }, { status: 201 });
  } catch (error: unknown) {
    // Handle known ContactError instances with their status codes.
    if (error instanceof ContactError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.statusCode },
      );
    }

    console.error('Create contact error:', error);
    return Response.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 },
    );
  }
}
