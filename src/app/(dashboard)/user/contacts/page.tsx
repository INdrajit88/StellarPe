'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';

/** CSRF token generator for state-mutating requests */
function generateCsrfToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}

interface Contact {
  id: string;
  displayName: string;
  stellarAddress: string | null;
  username: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Contacts page.
 * Lists contacts alphabetically, supports add/edit/delete contacts,
 * and quick-pay from a contact (navigates to /user/send with recipient pre-filled).
 *
 * @see Requirements 6.1–6.6
 */
export default function ContactsPage() {
  const router = useRouter();

  // Contact list state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Add/Edit modal state
  const [showModal, setShowModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [formName, setFormName] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // Delete confirmation state
  const [deletingContact, setDeletingContact] = useState<Contact | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchContacts = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/contacts', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts || []);
      } else {
        setError('Failed to load contacts.');
      }
    } catch {
      setError('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  function openAddModal() {
    setEditingContact(null);
    setFormName('');
    setFormAddress('');
    setFormUsername('');
    setFormError('');
    setShowModal(true);
  }

  function openEditModal(contact: Contact) {
    setEditingContact(contact);
    setFormName(contact.displayName);
    setFormAddress(contact.stellarAddress || '');
    setFormUsername(contact.username || '');
    setFormError('');
    setShowModal(true);
  }

  async function handleSaveContact() {
    setFormError('');

    if (!formName.trim()) {
      setFormError('Display name is required.');
      return;
    }
    if (!formAddress.trim() && !formUsername.trim()) {
      setFormError('Stellar address or username is required.');
      return;
    }

    setFormLoading(true);

    try {
      const token = localStorage.getItem('token');
      const csrfToken = generateCsrfToken();

      const body: Record<string, string> = { displayName: formName.trim() };
      if (formAddress.trim()) body.stellarAddress = formAddress.trim();
      if (formUsername.trim()) body.username = formUsername.trim();

      const isEdit = !!editingContact;
      const url = isEdit ? `/api/contacts/${editingContact!.id}` : '/api/contacts';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-csrf-token': csrfToken,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error || 'Failed to save contact.');
        setFormLoading(false);
        return;
      }

      setShowModal(false);
      fetchContacts();
    } catch {
      setFormError('Network error. Please try again.');
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDeleteContact() {
    if (!deletingContact) return;

    setDeleteLoading(true);

    try {
      const token = localStorage.getItem('token');
      const csrfToken = generateCsrfToken();

      const res = await fetch(`/api/contacts/${deletingContact.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-csrf-token': csrfToken,
        },
      });

      if (res.ok) {
        setDeletingContact(null);
        fetchContacts();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to delete contact.');
        setDeletingContact(null);
      }
    } catch {
      setError('Network error. Please try again.');
      setDeletingContact(null);
    } finally {
      setDeleteLoading(false);
    }
  }

  function handleQuickPay(contact: Contact) {
    const recipient = contact.username || contact.stellarAddress || '';
    router.push(`/user/send?recipient=${encodeURIComponent(recipient)}`);
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
        <Button size="sm" onClick={openAddModal}>
          Add Contact
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {/* Contact List */}
      {loading ? (
        <Card>
          <div className="space-y-4 py-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex animate-pulse items-center justify-between">
                <div className="space-y-2">
                  <div className="h-4 w-28 rounded bg-gray-200" />
                  <div className="h-3 w-40 rounded bg-gray-200" />
                </div>
                <div className="h-8 w-16 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        </Card>
      ) : contacts.length === 0 ? (
        <Card>
          <div className="py-8 text-center">
            <p className="text-sm text-gray-500">No contacts yet.</p>
            <p className="mt-1 text-sm text-gray-400">
              Add a contact to send payments quickly.
            </p>
          </div>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-gray-100" role="list">
            {contacts.map((contact) => (
              <li key={contact.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {contact.displayName}
                  </p>
                  <p className="truncate text-xs text-gray-500">
                    {contact.username
                      ? `@${contact.username}`
                      : contact.stellarAddress
                        ? `${contact.stellarAddress.slice(0, 8)}...${contact.stellarAddress.slice(-6)}`
                        : '—'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleQuickPay(contact)}
                    className="rounded-md px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                    title="Send payment"
                  >
                    Pay
                  </button>
                  <button
                    onClick={() => openEditModal(contact)}
                    className="rounded-md px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                    title="Edit contact"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeletingContact(contact)}
                    className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                    title="Delete contact"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Add/Edit Contact Modal */}
      <Modal
        open={showModal}
        onClose={() => {
          if (!formLoading) setShowModal(false);
        }}
        title={editingContact ? 'Edit Contact' : 'Add Contact'}
      >
        <div className="space-y-4">
          <Input
            label="Display Name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="e.g. Alice"
            disabled={formLoading}
          />
          <Input
            label="Stellar Address"
            value={formAddress}
            onChange={(e) => setFormAddress(e.target.value)}
            placeholder="G..."
            disabled={formLoading}
          />
          <Input
            label="Username"
            value={formUsername}
            onChange={(e) => setFormUsername(e.target.value)}
            placeholder="@username"
            disabled={formLoading}
          />

          {formError && (
            <p className="text-sm text-red-600" role="alert">
              {formError}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setShowModal(false)}
              disabled={formLoading}
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleSaveContact}
              loading={formLoading}
            >
              {editingContact ? 'Save' : 'Add'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deletingContact}
        onClose={() => {
          if (!deleteLoading) setDeletingContact(null);
        }}
        title="Delete Contact"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Are you sure you want to delete{' '}
            <span className="font-semibold">{deletingContact?.displayName}</span>?
            This action cannot be undone.
          </p>

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setDeletingContact(null)}
              disabled={deleteLoading}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={handleDeleteContact}
              loading={deleteLoading}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
