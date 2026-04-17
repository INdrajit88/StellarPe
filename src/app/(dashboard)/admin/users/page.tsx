'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

/**
 * Shape of a user record returned by GET /api/admin/users.
 */
interface AdminUser {
  id: string;
  username: string;
  email: string;
  role: 'USER' | 'MERCHANT' | 'ADMIN';
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
}

/**
 * Pagination metadata returned alongside the user list.
 */
interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/**
 * Admin User Management page.
 *
 * Displays a paginated list of all registered Users and Merchants (25 per page),
 * supports search by username or email, and allows the admin to activate or
 * deactivate accounts.
 *
 * @see Requirements 12.2 (paginated user list), 12.3 (search by username/email),
 *      12.4 (deactivate account), 12.5 (reactivate account)
 */
export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 0,
  });
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Debounce search input — wait 300ms after the user stops typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset to page 1 when search changes
  useEffect(() => {
    setPagination((prev) => ({ ...prev, page: 1 }));
  }, [debouncedSearch]);

  /**
   * Fetches the paginated user list from the admin API.
   */
  const fetchUsers = useCallback(
    async (page: number, searchQuery: string) => {
      setLoading(true);
      setError('');
      try {
        const token = localStorage.getItem('token');
        const params = new URLSearchParams({ page: String(page) });
        if (searchQuery.trim()) {
          params.set('search', searchQuery.trim());
        }

        const res = await fetch(`/api/admin/users?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || 'Failed to load users.');
          return;
        }

        const data = await res.json();
        setUsers(data.users ?? []);
        setPagination(data.pagination ?? { page: 1, pageSize: 25, total: 0, totalPages: 0 });
      } catch {
        setError('Failed to load users.');
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // Fetch users whenever page or debounced search changes
  useEffect(() => {
    fetchUsers(pagination.page, debouncedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, debouncedSearch, fetchUsers]);

  /**
   * Toggles a user's account status between ACTIVE and INACTIVE.
   * Sends a PUT request with CSRF token to the admin status endpoint.
   *
   * @see Requirements 12.4, 12.5, 13.7
   */
  const toggleStatus = async (user: AdminUser) => {
    const newStatus = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setTogglingId(user.id);

    try {
      const token = localStorage.getItem('token');

      // Generate a CSRF token for the state-mutating PUT request.
      const csrfToken = crypto.randomUUID();

      const res = await fetch(`/api/admin/users/${user.id}/status`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Failed to update account status.`);
        return;
      }

      // Update the local state optimistically
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, status: newStatus } : u)),
      );
    } catch {
      setError('Failed to update account status.');
    } finally {
      setTogglingId(null);
    }
  };

  const goToPage = (page: number) => {
    setPagination((prev) => ({ ...prev, page }));
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      {/* Header with back link */}
      <div className="mb-6 flex items-center gap-3">
        <a
          href="/admin"
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
          aria-label="Back to Admin Dashboard"
        >
          ← Dashboard
        </a>
      </div>

      <h1 className="mb-6 text-2xl font-bold text-gray-900">
        User Management
      </h1>

      {/* Search bar */}
      <div className="mb-4">
        <Input
          placeholder="Search by username or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search users by username or email"
          icon={<SearchIcon />}
        />
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3" role="alert">
          <p className="text-sm text-red-600">{error}</p>
          <button
            onClick={() => setError('')}
            className="mt-1 text-sm font-medium text-red-700 hover:text-red-600"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <div className="flex animate-pulse items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 rounded bg-gray-200" />
                  <div className="h-3 w-48 rounded bg-gray-200" />
                </div>
                <div className="h-8 w-20 rounded bg-gray-200" />
              </div>
            </Card>
          ))}
        </div>
      ) : users.length === 0 ? (
        /* Empty state */
        <Card>
          <div className="flex flex-col items-center gap-3 py-8">
            <UsersIcon />
            <p className="text-sm text-gray-500">
              {debouncedSearch
                ? 'No users match your search.'
                : 'No users found.'}
            </p>
          </div>
        </Card>
      ) : (
        <>
          {/* User list */}
          <div className="space-y-3">
            {users.map((user) => (
              <Card key={user.id}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {/* User info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-sm font-bold text-indigo-600">
                      {user.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {user.username}
                        </p>
                        <RoleBadge role={user.role} />
                      </div>
                      <p className="truncate text-sm text-gray-500">
                        {user.email}
                      </p>
                    </div>
                  </div>

                  {/* Status + toggle */}
                  <div className="flex items-center gap-3 sm:shrink-0">
                    <StatusBadge status={user.status} />
                    <Button
                      variant={user.status === 'ACTIVE' ? 'danger' : 'primary'}
                      size="sm"
                      loading={togglingId === user.id}
                      onClick={() => toggleStatus(user)}
                      aria-label={
                        user.status === 'ACTIVE'
                          ? `Deactivate ${user.username}`
                          : `Activate ${user.username}`
                      }
                    >
                      {user.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Pagination controls */}
          {pagination.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Showing{' '}
                {(pagination.page - 1) * pagination.pageSize + 1}–
                {Math.min(pagination.page * pagination.pageSize, pagination.total)}{' '}
                of {pagination.total}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => goToPage(pagination.page - 1)}
                  aria-label="Previous page"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => goToPage(pagination.page + 1)}
                  aria-label="Next page"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Badge components                                                   */
/* ------------------------------------------------------------------ */

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    USER: 'bg-blue-100 text-blue-700',
    MERCHANT: 'bg-purple-100 text-purple-700',
    ADMIN: 'bg-amber-100 text-amber-700',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[role] ?? 'bg-gray-100 text-gray-700'}`}
    >
      {role}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isActive = status === 'ACTIVE';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-red-500'}`}
        aria-hidden="true"
      />
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Icon components                                                    */
/* ------------------------------------------------------------------ */

function SearchIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-8 w-8 text-gray-400"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
      />
    </svg>
  );
}
