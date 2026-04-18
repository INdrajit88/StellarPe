'use client';

import { useEffect, useRef, useState } from 'react';

/** Internal props for a single toast item */
export interface ToastItemProps {
  id: string;
  message: string;
  duration: number;
  onDismiss: (id: string) => void;
}

/**
 * Individual toast notification rendered inside the ToastProvider portal.
 * Handles its own fade-in/fade-out lifecycle and auto-dismiss timer.
 */
export function ToastItem({ id, message, duration, onDismiss }: ToastItemProps) {
  const [visible, setVisible] = useState(false);
  const hasAppeared = useRef(false);

  useEffect(() => {
    // Trigger fade-in on next frame so the CSS transition activates
    const frameId = requestAnimationFrame(() => {
      setVisible(true);
      hasAppeared.current = true;
    });
    return () => cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    // Start the auto-dismiss countdown
    const dismissTimer = setTimeout(() => {
      setVisible(false);
    }, duration);

    return () => clearTimeout(dismissTimer);
  }, [duration]);

  useEffect(() => {
    // After fade-out completes, remove from state
    // Only trigger removal after the toast has been visible at least once
    if (!visible && hasAppeared.current) {
      const removeTimer = setTimeout(() => {
        onDismiss(id);
      }, 200); // matches CSS transition duration
      return () => clearTimeout(removeTimer);
    }
  }, [visible, id, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto rounded-lg bg-gray-900 px-4 py-2 text-sm text-white shadow-lg"
      style={{
        transition: 'opacity 200ms ease-in-out',
        opacity: visible ? 1 : 0,
      }}
    >
      {message}
    </div>
  );
}
