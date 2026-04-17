'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/** Debounce delay for search input (300ms) */
const DEBOUNCE_MS = 300;

interface UserResult {
  username: string;
  stellarAddress: string;
}

export interface UsernameAutocompleteProps {
  /** Callback when a user is selected from the dropdown */
  onSelect: (user: UserResult) => void;
  /** Current value of the input (controlled) */
  value: string;
  /** Callback when the input value changes */
  onChange: (value: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Error message */
  error?: string;
  /** Label text */
  label?: string;
  /** Whether the input is disabled */
  disabled?: boolean;
}

/**
 * Username autocomplete component.
 * Debounced input (300ms) that calls /api/users/search?q= and displays
 * up to 10 matching usernames in a dropdown.
 *
 * @see Requirements 9.5 (search users by partial username, up to 10 results)
 */
export function UsernameAutocomplete({
  onSelect,
  value,
  onChange,
  placeholder = 'Username or Stellar address',
  error,
  label = 'Recipient',
  disabled = false,
}: UsernameAutocompleteProps) {
  const [results, setResults] = useState<UserResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const searchUsers = useCallback(async (query: string) => {
    if (query.trim().length === 0) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    // Don't search if it looks like a Stellar address (56 chars starting with G)
    if (query.length === 56 && query.startsWith('G')) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    setSearching(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(query.trim())}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setResults(data.users || []);
        setShowDropdown((data.users || []).length > 0);
      } else {
        setResults([]);
        setShowDropdown(false);
      }
    } catch {
      setResults([]);
      setShowDropdown(false);
    } finally {
      setSearching(false);
    }
  }, []);

  // Debounced search on value change
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      searchUsers(value);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [value, searchUsers]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (user: UserResult) => {
    onSelect(user);
    onChange(user.username);
    setShowDropdown(false);
  };

  const inputId = `input-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div ref={containerRef} className="relative w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="mb-1 block text-sm font-medium text-gray-700"
        >
          {label}
        </label>
      )}

      <div className="relative">
        <input
          id={inputId}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            if (results.length > 0) setShowDropdown(true);
          }}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={errorId}
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          autoComplete="off"
          className={`
            block w-full rounded-lg border bg-white px-3 py-2 text-base
            placeholder:text-gray-400
            transition-colors duration-150
            focus:outline-none focus:ring-2 focus:ring-offset-0
            disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400
            ${
              error
                ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'
            }
          `.trim()}
        />

        {searching && (
          <span className="absolute inset-y-0 right-0 flex items-center pr-3">
            <svg
              className="h-4 w-4 animate-spin text-gray-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </span>
        )}
      </div>

      {error && (
        <p id={errorId} className="mt-1 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {/* Dropdown results */}
      {showDropdown && results.length > 0 && (
        <ul
          className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          role="listbox"
        >
          {results.map((user) => (
            <li key={user.username} role="option" aria-selected={false}>
              <button
                type="button"
                onClick={() => handleSelect(user)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50"
              >
                <span className="text-sm font-medium text-gray-900">
                  @{user.username}
                </span>
                <span className="truncate text-xs text-gray-400">
                  {user.stellarAddress.slice(0, 8)}...{user.stellarAddress.slice(-6)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

UsernameAutocomplete.displayName = 'UsernameAutocomplete';
