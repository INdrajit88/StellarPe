'use client';

import {
  HTMLAttributes,
  forwardRef,
  useEffect,
  useRef,
  useCallback,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from 'react';

export interface ModalProps extends HTMLAttributes<HTMLDivElement> {
  /** Whether the modal is open */
  open: boolean;
  /** Callback fired when the modal should close */
  onClose: () => void;
  /** Accessible title for the modal dialog */
  title?: string;
}

/** CSS selector for focusable elements inside a container */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Reusable Modal component with overlay, close button, keyboard Escape handling,
 * and focus trap for accessibility. Mobile-first, Tailwind-styled.
 */
export const Modal = forwardRef<HTMLDivElement, ModalProps>(
  ({ open, onClose, title, children, className = '', ...props }, ref) => {
    const panelRef = useRef<HTMLDivElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    // --- Focus trap ---
    const trapFocus = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;

      const focusable = panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }, []);

    // --- Escape key handler ---
    useEffect(() => {
      if (!open) return;

      const handleKeyDown = (e: globalThis.KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, [open, onClose]);

    // --- Focus management: save previous focus and move focus into modal ---
    useEffect(() => {
      if (open) {
        previousFocusRef.current = document.activeElement as HTMLElement;

        // Slight delay to allow the modal DOM to render before focusing
        const timer = setTimeout(() => {
          const panel = panelRef.current;
          if (!panel) return;
          const first = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
          if (first) {
            first.focus();
          } else {
            panel.focus();
          }
        }, 0);

        return () => clearTimeout(timer);
      } else {
        // Restore focus when the modal closes
        previousFocusRef.current?.focus();
      }
    }, [open]);

    // --- Lock body scroll while modal is open ---
    useEffect(() => {
      if (open) {
        document.body.style.overflow = 'hidden';
      }
      return () => {
        document.body.style.overflow = '';
      };
    }, [open]);

    if (!open) return null;

    const handleOverlayClick = (e: ReactMouseEvent<HTMLDivElement>) => {
      // Close only when clicking the overlay itself, not the panel
      if (e.target === e.currentTarget) {
        onClose();
      }
    };

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        role="presentation"
        onClick={handleOverlayClick}
      >
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
        <div
          ref={(node) => {
            // Merge forwarded ref + internal ref
            (panelRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
          }}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          tabIndex={-1}
          onKeyDown={trapFocus}
          className={`relative w-full max-w-lg rounded-xl bg-white p-6 shadow-xl focus:outline-none ${className}`}
          {...props}
        >
          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="absolute right-3 top-3 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>

          {/* Optional title */}
          {title && (
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              {title}
            </h2>
          )}

          {children}
        </div>
      </div>
    );
  }
);

Modal.displayName = 'Modal';
