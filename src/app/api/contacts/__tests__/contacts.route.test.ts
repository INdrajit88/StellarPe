/**
 * Unit tests for GET /api/contacts and POST /api/contacts route handlers.
 *
 * Tests cover:
 * - GET: Successful contact list returns 200
 * - GET: Role guard rejects non-USER roles with 403
 * - GET: Unexpected errors return 500
 * - POST: Successful contact creation returns 201
 * - POST: CSRF check rejects missing token with 403
 * - POST: Role guard rejects non-USER roles with 403
 * - POST: Zod validation rejects invalid payloads with 400
 * - POST: Invalid JSON body returns 400
 * - POST: ContactError mapped to correct status codes (404, 409)
 * - POST: Unexpected errors return 500
 */

import { GET, POST } from '../route';
import * as ContactServiceModule from '@/lib/services/contact.service';
import { ContactError, ContactErrorCode } from '@/lib/services/contact.service';

// Mock ContactService methods
jest.mock('@/lib/services/contact.service', () => {
  const actual = jest.requireActual('@/lib/services/contact.service') as typeof ContactServiceModule;
  return {
    ...actual,
    listContacts: jest.fn(),
    createContact: jest.fn(),
  };
});

const mockListContacts = ContactServiceModule.listContacts as jest.MockedFunction<
  typeof ContactServiceModule.listContacts
>;
const mockCreateContact = ContactServiceModule.createContact as jest.MockedFunction<
  typeof ContactServiceModule.createContact
>;

/**
 * Helper: builds a GET Request with auth headers set by Edge middleware.
 */
function buildGetRequest(options?: {
  userId?: string;
  role?: string;
  omitAuth?: boolean;
}): Request {
  const headers: Record<string, string> = {};

  if (!options?.omitAuth) {
    headers['x-user-id'] = options?.userId ?? 'user-1';
    headers['x-user-role'] = options?.role ?? 'USER';
  }

  return new Request('http://localhost/api/contacts', {
    method: 'GET',
    headers,
  });
}

/**
 * Helper: builds a POST Request with JSON body and auth headers.
 */
function buildPostRequest(
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

  return new Request('http://localhost/api/contacts', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

/**
 * Helper: builds a POST Request with invalid JSON body.
 */
function buildBadJsonRequest(): Request {
  return new Request('http://localhost/api/contacts', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': 'test-csrf-token',
      'x-user-id': 'user-1',
      'x-user-role': 'USER',
    },
    body: 'not-valid-json{{{',
  });
}

describe('GET /api/contacts', () => {
  it('returns 200 with contacts list on success', async () => {
    const mockContacts = [
      { id: 'c1', displayName: 'Alice', stellarAddress: `G${'A'.repeat(55)}` },
      { id: 'c2', displayName: 'Bob', username: 'bob123' },
    ];
    mockListContacts.mockResolvedValueOnce(mockContacts);

    const request = buildGetRequest();
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.contacts).toEqual(mockContacts);
    expect(mockListContacts).toHaveBeenCalledWith('user-1');
  });

  it('returns 200 with empty array when no contacts exist', async () => {
    mockListContacts.mockResolvedValueOnce([]);

    const request = buildGetRequest();
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.contacts).toEqual([]);
  });

  it('returns 403 for MERCHANT role', async () => {
    const request = buildGetRequest({ role: 'MERCHANT' });
    const response = await GET(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('Forbidden');
    expect(mockListContacts).not.toHaveBeenCalled();
  });

  it('returns 403 for ADMIN role', async () => {
    const request = buildGetRequest({ role: 'ADMIN' });
    const response = await GET(request);

    expect(response.status).toBe(403);
    expect(mockListContacts).not.toHaveBeenCalled();
  });

  it('returns 403 when role is missing', async () => {
    const request = buildGetRequest({ omitAuth: true });
    const response = await GET(request);

    expect(response.status).toBe(403);
  });

  it('returns 500 for unexpected errors', async () => {
    mockListContacts.mockRejectedValueOnce(new Error('Database connection failed'));

    const request = buildGetRequest();
    const response = await GET(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('unexpected error');
  });
});

describe('POST /api/contacts', () => {
  const validPayload = {
    displayName: 'Alice',
    stellarAddress: `G${'A'.repeat(55)}`,
  };

  it('returns 201 with contact on successful creation', async () => {
    const mockContact = {
      id: 'c1',
      userId: 'user-1',
      displayName: 'Alice',
      stellarAddress: `G${'A'.repeat(55)}`,
      username: null,
    };
    mockCreateContact.mockResolvedValueOnce({ contact: mockContact });

    const request = buildPostRequest(validPayload);
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.contact).toEqual(mockContact);
    expect(mockCreateContact).toHaveBeenCalledWith('user-1', {
      displayName: 'Alice',
      stellarAddress: `G${'A'.repeat(55)}`,
      username: undefined,
    });
  });

  it('returns 201 when creating contact with username', async () => {
    const mockContact = {
      id: 'c2',
      userId: 'user-1',
      displayName: 'Bob',
      stellarAddress: null,
      username: 'bob123',
    };
    mockCreateContact.mockResolvedValueOnce({ contact: mockContact });

    const request = buildPostRequest({ displayName: 'Bob', username: 'bob123' });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.contact).toEqual(mockContact);
  });

  it('returns 403 when CSRF token is missing', async () => {
    const request = buildPostRequest(validPayload, { omitCsrf: true });
    const response = await POST(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('CSRF');
    expect(mockCreateContact).not.toHaveBeenCalled();
  });

  it('returns 403 for MERCHANT role', async () => {
    const request = buildPostRequest(validPayload, { role: 'MERCHANT' });
    const response = await POST(request);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toContain('Forbidden');
    expect(mockCreateContact).not.toHaveBeenCalled();
  });

  it('returns 403 for ADMIN role', async () => {
    const request = buildPostRequest(validPayload, { role: 'ADMIN' });
    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(mockCreateContact).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON body', async () => {
    const request = buildBadJsonRequest();
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid JSON');
  });

  it('returns 400 when displayName is missing', async () => {
    const request = buildPostRequest({ stellarAddress: `G${'A'.repeat(55)}` });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Validation failed.');
    expect(data.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'displayName' }),
      ]),
    );
  });

  it('returns 400 when neither stellarAddress nor username is provided', async () => {
    const request = buildPostRequest({ displayName: 'Alice' });
    const response = await POST(request);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Validation failed.');
  });

  it('returns 400 when stellarAddress has invalid format', async () => {
    const request = buildPostRequest({
      displayName: 'Alice',
      stellarAddress: 'INVALID_ADDRESS',
    });
    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('returns 404 when stellar address not found in system', async () => {
    mockCreateContact.mockRejectedValueOnce(
      new ContactError(
        'Stellar address "GNOTFOUND" not found in the system.',
        ContactErrorCode.ADDRESS_NOT_FOUND,
        404,
      ),
    );

    const request = buildPostRequest(validPayload);
    const response = await POST(request);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.code).toBe(ContactErrorCode.ADDRESS_NOT_FOUND);
  });

  it('returns 404 when username not found in system', async () => {
    mockCreateContact.mockRejectedValueOnce(
      new ContactError(
        'Username "unknown" not found in the system.',
        ContactErrorCode.USERNAME_NOT_FOUND,
        404,
      ),
    );

    const request = buildPostRequest({ displayName: 'Unknown', username: 'unknown_user' });
    const response = await POST(request);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.code).toBe(ContactErrorCode.USERNAME_NOT_FOUND);
  });

  it('returns 409 for duplicate contact', async () => {
    mockCreateContact.mockRejectedValueOnce(
      new ContactError(
        'A contact with this Stellar address already exists.',
        ContactErrorCode.DUPLICATE_CONTACT,
        409,
      ),
    );

    const request = buildPostRequest(validPayload);
    const response = await POST(request);

    expect(response.status).toBe(409);
    const data = await response.json();
    expect(data.code).toBe(ContactErrorCode.DUPLICATE_CONTACT);
  });

  it('returns 500 for unexpected errors', async () => {
    mockCreateContact.mockRejectedValueOnce(new Error('Database connection failed'));

    const request = buildPostRequest(validPayload);
    const response = await POST(request);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toContain('unexpected error');
  });
});
