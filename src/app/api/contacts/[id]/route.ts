/**
 * PUT /api/contacts/[id] — Update an existing contact.
 * DELETE /api/contacts/[id] — Delete a contact.
 *
 * Requires JWT authentication (handled by Edge middleware which sets
 * x-user-id and x-user-role headers). Accessible only by the USER role.
 *
 * Both endpoints require CSRF validation (state-mutating methods).
 *
 * Middleware stack (PUT):
 * 1. JWT auth (Edge middleware — x-user-id / x-user-role headers)
 * 2. CSRF validation (PUT is state-mutating)
 * 3. Role guard (USER only)
 * 4. Zod validation (updateContactSchema)
 *
 * Middleware stack (DELETE):
 * 1. JWT auth (Edge middleware — x-user-id / x-user-role headers)
 * 2. CSRF validation (DELETE is state-mutating)
 * 3. Role guard (USER only)
 *
 * Error mapping:
 * - 400: Validation failure
 * - 403: CSRF missing or role not authorized
 * - 404: Contact not found
 * - 409: Duplicate contact (on update)
 * - 500: Unexpected server error
 *
 * @see Requirements 6.4, 6.5, 6.6
 */

import { updateContact, deleteContact, ContactError } from '@/lib/services/contact.service';
import { updateContactSchema } from '@/lib/validators/contact.validator';
import { validateRequest } from '@/lib/middleware/validator';
import { requireRole } from '@/lib/middleware/role-guard';
import { validateCsrf } from '@/lib/middleware/csrf';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // Step 1: CSRF validation — PUT is a state-mutating method.
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

    // Step 4: Extract contact ID from dynamic route params.
    const { id: contactId } = await params;

    // Step 5: Parse and validate the request body with Zod.
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { error: 'Invalid JSON in request body.' },
        { status: 400 },
      );
    }

    const validation = validateRequest(updateContactSchema, body);
    if (validation.error) {
      return validation.error;
    }

    // Step 6: Delegate to ContactService.updateContact.
    const result = await updateContact(userId!, contactId, {
      displayName: validation.data.displayName,
      stellarAddress: validation.data.stellarAddress,
      username: validation.data.username,
    });

    // Step 7: Return updated contact.
    return Response.json({ contact: result.contact }, { status: 200 });
  } catch (error: unknown) {
    // Handle known ContactError instances with their status codes.
    if (error instanceof ContactError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.statusCode },
      );
    }

    console.error('Update contact error:', error);
    return Response.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // Step 1: CSRF validation — DELETE is a state-mutating method.
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

    // Step 4: Extract contact ID from dynamic route params.
    const { id: contactId } = await params;

    // Step 5: Delegate to ContactService.deleteContact.
    await deleteContact(userId!, contactId);

    // Step 6: Return success response (no content).
    return Response.json({ message: 'Contact deleted successfully.' }, { status: 200 });
  } catch (error: unknown) {
    // Handle known ContactError instances with their status codes.
    if (error instanceof ContactError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.statusCode },
      );
    }

    console.error('Delete contact error:', error);
    return Response.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 },
    );
  }
}
