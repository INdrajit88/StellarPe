/**
 * Unit tests for the role-based access guard.
 *
 * Validates that:
 * - Authorized roles pass through (null returned)
 * - Unauthorized roles get a 403 response
 * - Missing/null roles get a 403 response
 * - Multiple allowed roles work correctly
 *
 * @see Requirements 12.6 (Admin-only returns 403 for non-Admin)
 */

import { requireRole } from '../role-guard';

describe('Role Guard', () => {
  describe('requireRole', () => {
    it('returns null for an allowed role', () => {
      const guard = requireRole('USER');
      expect(guard('USER')).toBeNull();
    });

    it('returns null for any allowed role in a multi-role guard', () => {
      const guard = requireRole('USER', 'MERCHANT');
      expect(guard('USER')).toBeNull();
      expect(guard('MERCHANT')).toBeNull();
    });

    it('returns 403 Response for an unauthorized role', async () => {
      const guard = requireRole('ADMIN');
      const result = guard('USER');

      expect(result).not.toBeNull();
      expect(result).toBeInstanceOf(Response);
      expect(result!.status).toBe(403);

      const body = await result!.json();
      expect(body.error).toContain('Forbidden');
    });

    it('returns 403 Response for a role not in the allowed list', async () => {
      const guard = requireRole('USER', 'MERCHANT');
      const result = guard('ADMIN');

      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);

      const body = await result!.json();
      expect(body.requiredRoles).toEqual(['USER', 'MERCHANT']);
      expect(body.currentRole).toBe('ADMIN');
    });

    it('returns 403 Response when role is null', async () => {
      const guard = requireRole('USER');
      const result = guard(null);

      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);

      const body = await result!.json();
      expect(body.error).toContain('Authentication required');
    });

    it('returns 403 Response when role is undefined', async () => {
      const guard = requireRole('USER');
      const result = guard(undefined);

      expect(result).not.toBeNull();
      expect(result!.status).toBe(403);
    });

    it('is case-sensitive for role matching', () => {
      const guard = requireRole('ADMIN');
      expect(guard('ADMIN')).toBeNull();
      expect(guard('admin')).not.toBeNull();
      expect(guard('Admin')).not.toBeNull();
    });

    it('works with single Admin-only guard', async () => {
      const guard = requireRole('ADMIN');

      expect(guard('ADMIN')).toBeNull();

      const userResult = guard('USER');
      expect(userResult).not.toBeNull();
      expect(userResult!.status).toBe(403);

      const merchantResult = guard('MERCHANT');
      expect(merchantResult).not.toBeNull();
      expect(merchantResult!.status).toBe(403);
    });
  });
});
