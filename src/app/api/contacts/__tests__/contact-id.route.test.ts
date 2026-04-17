/**
 * Unit tests for PUT /api/contacts/[id] and DELETE /api/contacts/[id] route handlers.
 *
 * Tests cover:
 * - PUT: Successful contact update returns 200
 * - PUT: CSRF check rejects missing token with 403
 * - PUT: Role guard rejects non-USER roles with 403
 * - PUT: Zod validation rejects invalid payloads with 400
 * - PUT: Invalid JSON body returns 400
 * - PUT: ContactError mapped to correct status codes (404, 409)
 * - PUT: Unexpected errors return 500
 * - DELETE: Successful contact deletion returns 200
 * - DELETE: CSRF check rejects missing token with 403
 * - DELETE: Role guard rejects non-USER roles with 403
 * - DELETE: ContactError 404 when contact not found
 * - DELETE: Unexpected errors return 500
 */

import { PUT, DELETE } from '../[id]/route';
import * as ContactServiceModule from '@/lib/services/contact.service';
import { ContactError, ContactErrorCode } from '@/lib/services/contact.service';

// Mock ContactService methods
jest.mock('@/lib/services/contact.service', () => {
  const actual = jest.requireActual('@/lib/services/contact.service') as typeof ContactServiceModule;
  return {
    ...actual,
    updateContact: jest.fn(),
    deleteContact: jest.fn(),
  };
});

const mockUpdateContact = ContactServiceModule.updateContact as jest.MockedFunction<
  typeof ContactServiceModule.updateContact
>;
const mockDeleteContact = ContactServiceModule.deleteContact as jest.MockedFunction<
  typeof ContactServiceModule.deleteContact
>;

/** Default contact ID used in tests. */
const CONTACT_ID = 'contact-123';

/**
 * Helper: builds a PUT Request with JSON body and auth headers.
 */
function buildPutRequest(
  body: unknown,
  options?: {
    userId?: string;
    role?: string;
    omitCsrf?: boolean;
    omitAuth?: boolean;
  },
): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };

  if (!options?.omitCsrf) {
    headers['x-csrf-token'] = 'test-csrf-token';
  }

  if (!options?.omitAuth) {
    headers['x-user-id'] = options?.userId ?? 'user-1';
    headers['x-user-role'] = options?.role ?? 'USER';
  }

  return new Request(`http://localhost/api/contacts/${CONTACT_ID}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
  });
}

/**
 * Helper: builds a DELETE Request with auth headers.
 */
function buildDeleteRequest(options?: {
  userId?: string;
  role?: string;
  omitCsrf?: boolean;
  omitAuth?: boolean;
}): Request {
  const headers: Record<string, string> = {};

  if (!options?.omitCsrf) {
    headers['x-csrf-token'] = 'test-csrf-token';
  }

  if (!options?.omitAuth) {
    headers['x-user-id'] = options?.userId ?? 'user-1';
    headers['x-user-role'] = options?.role ?? 'USER';
  }

  return new Request(`http://localhost/api/contacts/${CONTACT_ID}`, {
    method: 'DELETE',
    headers,
  });
}

/**
 * Helper: builds a PUT Request with invalid JSON body.
 */
function buildBadJsonPutRequest(): Request {
  return new Request(`http://localhost/api/contacts/${CONTACT_ID}`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': 'test-csrf-token',
      'x-user-id': 'user-1',
      'x-user-role': 'USER',
    },
    body: 'not-valid-json{{{',
  });
}

/** Builds the params promise matching Next.js dynamic route convention. */
function buildParams(id: string = CONTACT_ID): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe('PUT /api/contacts/[id]', () => {
  const validPayload = { displayName: 'Alice Updated' };

  it('returns 200 with updated contact on success', async () => {
    const mockContact = {
      id: CONTACT_ID,
      userId: 'user-1',
      displayName: 'Alice Updated',
      stellarAddress: `G${'A'.repeat(55)}`,
      username: null,
    };
    mockUpdateContact.mockResolvedValueOnce({ contact: mockContact });

    const request = buildPutRequest(validPayload);
    const response = await PUT(request, buildParams());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.contact).toEqual(mockContact);
    expect(mockUpdateContact).toHaveBeenCalledWith('user-1', CONTACT_ID, {
      displayName: 'Alice Updated',
      stellarAddress: undefined,
      username: undefined,
    });
  });

  it('returns 200 when updating stellarAddress', async () => {
    const newAddress = `G${'B'.repeat(55)}`;
    const mockContact = {
      id: CONTACT_ID,
      userId: 'user-1',
      displayName: 'Alice',
      stellarAddress: newAddress,
      username: null,
    };
    mockUpdateContact.mockResolvedValueOnce({ contact: mockContact });

    const request = buildPutRequest({ stellarAddress: newAddress });
    const response = await PUT(request, buildParams());

    expect(response.status).toBe(200);
    expect(mockUpdateContact).toHaveBeenCalledWith('user-1', CONTACT_ID, {
      displayName: undefined,
      stellarAddress: newAddress,
      username: undefined,
    });
  });

  it('returns 403 when CSRF token is missing', async () => {
    const request = buildPutRequest(validPayload, { omitCsrf: true });
    const response = await PUT(request, buildParams());

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('CSRF');
    expect(mockUpdateContact).not.toHaveBeenCalled();
  });

  it('returns 403 for MERCHANT role', async () => {
    const request = buildPutRequest(validPayload, { role: 'MERCHANT' });
    const response = await PUT(request, buildParams());

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('Forbidden');
    expect(mockUpdateContact).not.toHaveBeenCalled();
  });

  it('returns 403 for ADMIN role', async () => {
    const request = buildPutRequest(validPayload, { role: 'ADMIN' });
    const response = await PUT(request, buildParams());

    expect(response.status).toBe(403);
    expect(mockUpdateContact).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON body', async () => {
    const request = buildBadJsonPutRequest();
    const response = await PUT(request, buildParams());

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid JSON');
  });

  it('returns 400 when no fields are provided for update', async () => {
    const request = buildPutRequest({});
    const response = await PUT(request, buildParams());

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Validation failed.');
  });

  it('returns 404 when contact not found', async () => {
    mockUpdateContact.mockRejectedValueOnce(
      new ContactError(
        'Contact not found.',
        ContactErrorCode.CONTACT_NOT_FOUND,
        404,
      ),
    );

    const request = buildPutRequest(validPayload);
    const response = await PUT(request, buildParams());

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.code).toBe(ContactErrorCode.CONTACT_NOT_FOUND);
  });

  it('returns 409 for duplicate contact on update', async () => {
    mockUpdateContact.mockRejectedValueOnce(
      new ContactError(
        'A contact with this Stellar address already exists.',
        ContactErrorCode.DUPLICATE_CONTACT,
        409,
      ),
    );

    const request = buildPutRequest({ stellarAddress: `G${'C'.repeat(55)}` });
    const response = await PUT(request, buildParams());

    expect(response.status).toBe(409);
    const data = await response.json();
    expect(data.code).toBe(ContactErrorCode.DUPLICATE_CONTACT);
  });

  it('returns 500 for unexpected errors', async () => {
    mockUpdateContact.mockRejectedValueOnce(new Error('Database connection failed'));

    const request = buildPutRequest(validPayload);
    const response = await PUT(request, buildParams());

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('unexpected error');
  });

  it('uses the correct contact ID from params', async () => {
    const customId = 'custom-contact-id';
    const mockContact = { id: customId, displayName: 'Test' };
    mockUpdateContact.mockResolvedValueOnce({ contact: mockContact });

    const request = buildPutRequest(validPayload);
    const response = await PUT(request, buildParams(customId));

    expect(response.status).toBe(200);
    expect(mockUpdateContact).toHaveBeenCalledWith('user-1', customId, expect.any(Object));
  });
});

describe('DELETE /api/contacts/[id]', () => {
  it('returns 200 on successful deletion', async () => {
    mockDeleteContact.mockResolvedValueOnce(undefined);

    const request = buildDeleteRequest();
    const response = await DELETE(request, buildParams());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.message).toContain('deleted');
    expect(mockDeleteContact).toHaveBeenCalledWith('user-1', CONTACT_ID);
  });

  it('returns 403 when CSRF token is missing', async () => {
    const request = buildDeleteRequest({ omitCsrf: true });
    const response = await DELETE(request, buildParams());

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('CSRF');
    expect(mockDeleteContact).not.toHaveBeenCalled();
  });

  it('returns 403 for MERCHANT role', async () => {
    const request = buildDeleteRequest({ role: 'MERCHANT' });
    const response = await DELETE(request, buildParams());

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('Forbidden');
    expect(mockDeleteContact).not.toHaveBeenCalled();
  });

  it('returns 403 for ADMIN role', async () => {
    const request = buildDeleteRequest({ role: 'ADMIN' });
    const response = await DELETE(request, buildParams());

    expect(response.status).toBe(403);
    expect(mockDeleteContact).not.toHaveBeenCalled();
  });

  it('returns 403 when role is missing', async () => {
    const request = buildDeleteRequest({ omitAuth: true });
    const response = await DELETE(request, buildParams());

    expect(response.status).toBe(403);
  });

  it('returns 404 when contact not found', async () => {
    mockDeleteContact.mockRejectedValueOnce(
      new ContactError(
        'Contact not found.',
        ContactErrorCode.CONTACT_NOT_FOUND,
        404,
      ),
    );

    const request = buildDeleteRequest();
    const response = await DELETE(request, buildParams());

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.code).toBe(ContactErrorCode.CONTACT_NOT_FOUND);
  });

  it('returns 500 for unexpected errors', async () => {
    mockDeleteContact.mockRejectedValueOnce(new Error('Database connection failed'));

    const request = buildDeleteRequest();
    const response = await DELETE(request, buildParams());

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('unexpected error');
  });

  it('uses the correct contact ID from params', async () => {
    const customId = 'custom-contact-id';
    mockDeleteContact.mockResolvedValueOnce(undefined);

    const request = buildDeleteRequest();
    const response = await DELETE(request, buildParams(customId));

    expect(response.status).toBe(200);
    expect(mockDeleteContact).toHaveBeenCalledWith('user-1', customId);
  });
});
