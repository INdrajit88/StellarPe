/**
 * CSRF protection for state-mutating API endpoints.
 *
 * Validates the presence of a CSRF token on all POST, PUT, and DELETE
 * requests. The token is expected in the `x-csrf-token` header and must
 * match a known value (typically stored in a cookie or session).
 *
 * For a stateless JWT-based API, we use a double-submit pattern:
 * - The client sends a CSRF token in the `x-csrf-token` header
 * - The server verifies the header is present and non-empty
 *
 * In a more advanced setup, this would validate the token against a
 * cookie-stored value. For this implementation, the presence of the
 * custom header is sufficient because:
 * - Cross-origin requests cannot set custom headers without CORS approval
 * - The browser's same-origin policy prevents forged requests from
 *   including arbitrary headers
 *
 * @see Requirements 13.7 (CSRF protection on all state-mutating endpoints)
 */

/** HTTP methods that mutate state and require CSRF protection. */
const STATE_MUTATING_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH'];

/** The header name where the CSRF token is expected. */
export const CSRF_HEADER = 'x-csrf-token';

/**
 * Validates CSRF protection on a request.
 *
 * @param request - The incoming Request object.
 * @returns A 403 Response if CSRF validation fails, or null if the
 *          request is valid (either non-mutating or has a valid token).
 */
export function validateCsrf(request: Request): Response | null {
  const method = request.method.toUpperCase();

  // Only check state-mutating methods.
  if (!STATE_MUTATING_METHODS.includes(method)) {
    return null;
  }

  const csrfToken = request.headers.get(CSRF_HEADER);

  if (!csrfToken || csrfToken.trim() === '') {
    return Response.json(
      {
        error: 'CSRF token missing. Include a non-empty x-csrf-token header on state-mutating requests.',
      },
      { status: 403 },
    );
  }

  // Token is present — request passes CSRF validation.
  // The mere presence of a custom header is sufficient because browsers
  // enforce the same-origin policy: cross-origin requests cannot include
  // custom headers without explicit CORS approval from the server.
  return null;
}
