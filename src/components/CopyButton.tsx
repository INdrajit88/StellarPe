'use client';

import { useState, useCallback, useRef } from 'react';
import { useToast } from '@/contexts/ToastContext';

export interface CopyButtonProps {
  /** The string value to copy to clipboard */
  value: string;
  /** Accessible label for the button. Default: "Copy to clipboard" */
  label?: string;
  /** Optional additional CSS classes */
  className?: string;
}

/**
 * Icon button that copies a value to the clipboard on click.
 *
 * - Uses `navigator.clipboard.writeText` when available
 * - Falls back to `document.execCommand('copy')` with a temporary textarea for older browsers
 * - Shows a checkmark icon for 1.5s after a successful copy
 * - Triggers a "Copied!" toast notification on success
 *
 * @see Requirements 10.1, 10.2, 10.3, 10.4
 */
export function CopyButton({
  value,
  label = 'Copy to clipboard',
  className = '',
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useToast();

  const handleCopy = useCallback(async () => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(value);
      } else {
        // Fallback for older browsers / insecure contexts
        const textarea = document.createElement('textarea');
        textarea.value = value;
        // Move off-screen to avoid visual flash
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '-9999px';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      toast.show('Copied!');
      setCopied(true);

      // Clear any existing timer before setting a new one
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        setCopied(false);
        timerRef.current = null;
      }, 1500);
    } catch {
      toast.show('Unable to copy. Please copy manually.');
    }
  }, [value, toast]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center rounded p-1 text-gray-400 transition-colors duration-150 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${className}`}
    >
      {copied ? (
        /* Checkmark icon */
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-green-400"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        /* Clipboard icon */
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}

CopyButton.displayName = 'CopyButton';
