/**
 * Role-based access guard for API route handlers.
 *
 * Provides a `requireRole` factory that returns a checker function.
 * The checker validates whether a user's role is among the allowed roles
 * for a given route.
 *
 * Usage in a route handler:
 *   const guard = requireRole('ADMIN');
 *   const error = guard(userRole);
 *   if (error) return error; // Returns a 403 Response
 *
 * Or with multiple roles:
 *   const guard = requireRole('USER', 'MERCHANT');
 *   const error = guard(userRole);
 *
 * @see Requirements 12.6 (Admin-only access returns 403 for non-Admin)
 */

/**
 * Creates a role guard that checks whether a user's role is in the
 * list of allowed roles.
 *
 * @param allowedRoles - One or more roles that are permitted access.
 * @returns A function that takes a user's role and returns a 403 Response
 *          if unauthorized, or null if the role is allowed.
 */
export function requireRole(
  ...allowedRoles: string[]
): (userRole: string | null | undefined) => Response | null {
  return (userRole: string | null | undefined): Response | null => {
    if (!userRole) {
      return Response.json(
        { error: 'Forbidden. Authentication required.' },
        { status: 403 },
      );
    }

    if (!allowedRoles.includes(userRole)) {
      return Response.json(
        {
          error: 'Forbidden. You do not have permission to access this resource.',
          requiredRoles: allowedRoles,
          currentRole: userRole,
        },
        { status: 403 },
      );
    }

    // Role is authorized.
    return null;
  };
}
