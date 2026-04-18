'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { ToastItem } from '@/components/ui/Toast';

/** Shape of a toast entry in the internal queue */
interface ToastEntry {
  id: string;
  message: string;
  duration: number;
}

/** Public API exposed by the toast context */
export interface ToastContextValue {
  show: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 2000;
const MAX_VISIBLE = 3;
const DEBOUNCE_MS = 500;

let toastIdCounter = 0;

/**
 * ToastProvider — wraps the app and renders toasts in a portal on document.body.
 *
 * Features:
 * - Queues toasts vertically, max 3 visible at once (oldest dismissed early)
 * - Debounces identical messages within 500ms
 * - Positioned fixed bottom-center, above BottomNav
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const recentMessagesRef = useRef<Map<string, number>>(new Map());
  const [mounted, setMounted] = useState(false);

  // Set mounted flag after hydration so the portal target (document.body) is available
  useEffect(() => {
    setMounted(true);
  }, []);

  const show = useCallback((message: string, duration: number = DEFAULT_DURATION) => {
    const now = Date.now();

    // Debounce identical messages within 500ms
    const lastShown = recentMessagesRef.current.get(message);
    if (lastShown !== undefined && now - lastShown < DEBOUNCE_MS) {
      return;
    }
    recentMessagesRef.current.set(message, now);

    // Clean up old debounce entries periodically
    if (recentMessagesRef.current.size > 50) {
      const cutoff = now - DEBOUNCE_MS;
      for (const [key, timestamp] of recentMessagesRef.current) {
        if (timestamp < cutoff) {
          recentMessagesRef.current.delete(key);
        }
      }
    }

    const id = `toast-${++toastIdCounter}`;
    const newToast: ToastEntry = { id, message, duration };

    setToasts((prev) => {
      const next = [...prev, newToast];
      // If we exceed max visible, trim the oldest
      if (next.length > MAX_VISIBLE) {
        return next.slice(next.length - MAX_VISIBLE);
      }
      return next;
    });
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const portalContent = (
    <div
      className="fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2 pointer-events-none"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          id={toast.id}
          message={toast.message}
          duration={toast.duration}
          onDismiss={dismiss}
        />
      ))}
    </div>
  );

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {mounted && typeof document !== 'undefined'
        ? createPortal(portalContent, document.body)
        : null}
    </ToastContext.Provider>
  );
}

/**
 * Hook to access the toast notification system.
 * Must be used within a ToastProvider.
 *
 * @example
 * const toast = useToast();
 * toast.show("Copied!");
 * toast.show("Saved!", 3000); // custom duration
 */
export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
