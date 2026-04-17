'use client';

import {
  forwardRef,
  useCallback,
  useRef,
  useState,
  useEffect,
  KeyboardEvent,
  ClipboardEvent,
  ChangeEvent,
  useImperativeHandle,
} from 'react';

export interface PinInputProps {
  /** Number of PIN digits (4–6). Defaults to 4. */
  length?: 4 | 5 | 6;
  /** Callback fired when the full PIN has been entered */
  onComplete?: (pin: string) => void;
  /** Callback fired on every change with the current partial/full value */
  onChange?: (value: string) => void;
  /** Whether the input is disabled */
  disabled?: boolean;
  /** Error message displayed below the digits */
  error?: string;
  /** Accessible label for the PIN input group */
  label?: string;
  /** Whether to mask entered digits */
  mask?: boolean;
}

export interface PinInputHandle {
  /** Clear all digits and focus the first input */
  clear: () => void;
  /** Focus the first empty input */
  focus: () => void;
}

/**
 * Numeric PIN input component with individual digit boxes.
 * Supports 4–6 digits, auto-advance on input, backspace handling,
 * and mobile numeric keyboard via inputMode="numeric" and pattern="[0-9]*".
 */
export const PinInput = forwardRef<PinInputHandle, PinInputProps>(
  (
    {
      length = 4,
      onComplete,
      onChange,
      disabled = false,
      error,
      label,
      mask = false,
    },
    ref
  ) => {
    const [digits, setDigits] = useState<string[]>(Array(length).fill(''));
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    // Expose imperative methods to parent via ref
    useImperativeHandle(ref, () => ({
      clear() {
        setDigits(Array(length).fill(''));
        inputRefs.current[0]?.focus();
      },
      focus() {
        const idx = digits.findIndex((d) => d === '');
        inputRefs.current[idx >= 0 ? idx : 0]?.focus();
      },
    }));

    // Re-sync digit array length when `length` prop changes
    useEffect(() => {
      setDigits((prev) => {
        if (prev.length === length) return prev;
        const next = Array(length).fill('');
        for (let i = 0; i < Math.min(prev.length, length); i++) {
          next[i] = prev[i];
        }
        return next;
      });
    }, [length]);

    const updateDigits = useCallback(
      (next: string[]) => {
        setDigits(next);
        const value = next.join('');
        onChange?.(value);
        if (value.length === length && next.every((d) => d !== '')) {
          onComplete?.(value);
        }
      },
      [length, onChange, onComplete]
    );

    const handleChange = useCallback(
      (index: number) => (e: ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value;
        // Only accept a single digit (0-9)
        const char = raw.replace(/[^0-9]/g, '').slice(-1);
        if (!char) return;

        const next = [...digits];
        next[index] = char;
        updateDigits(next);

        // Auto-advance to next input
        if (index < length - 1) {
          inputRefs.current[index + 1]?.focus();
        }
      },
      [digits, length, updateDigits]
    );

    const handleKeyDown = useCallback(
      (index: number) => (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace') {
          e.preventDefault();
          const next = [...digits];
          if (digits[index]) {
            // Clear current digit
            next[index] = '';
            updateDigits(next);
          } else if (index > 0) {
            // Move to previous digit and clear it
            next[index - 1] = '';
            updateDigits(next);
            inputRefs.current[index - 1]?.focus();
          }
        } else if (e.key === 'ArrowLeft' && index > 0) {
          inputRefs.current[index - 1]?.focus();
        } else if (e.key === 'ArrowRight' && index < length - 1) {
          inputRefs.current[index + 1]?.focus();
        }
      },
      [digits, length, updateDigits]
    );

    const handlePaste = useCallback(
      (e: ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        const pasted = e.clipboardData
          .getData('text/plain')
          .replace(/[^0-9]/g, '')
          .slice(0, length);
        if (!pasted) return;

        const next = [...digits];
        for (let i = 0; i < pasted.length; i++) {
          next[i] = pasted[i];
        }
        updateDigits(next);

        // Focus the input after the last pasted digit
        const focusIdx = Math.min(pasted.length, length - 1);
        inputRefs.current[focusIdx]?.focus();
      },
      [digits, length, updateDigits]
    );

    const errorId = error ? 'pin-input-error' : undefined;

    return (
      <div className="w-full">
        {label && (
          <label className="mb-2 block text-sm font-medium text-gray-700">
            {label}
          </label>
        )}

        <div
          className="flex items-center justify-center gap-2 sm:gap-3"
          role="group"
          aria-label={label ?? 'PIN input'}
        >
          {Array.from({ length }, (_, i) => (
            <input
              key={i}
              ref={(el) => {
                inputRefs.current[i] = el;
              }}
              type={mask ? 'password' : 'text'}
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              maxLength={1}
              value={digits[i]}
              disabled={disabled}
              aria-label={`Digit ${i + 1} of ${length}`}
              aria-invalid={!!error}
              aria-describedby={errorId}
              onChange={handleChange(i)}
              onKeyDown={handleKeyDown(i)}
              onPaste={i === 0 ? handlePaste : undefined}
              onFocus={(e) => e.target.select()}
              className={`
                h-12 w-10 rounded-lg border text-center text-xl font-semibold
                transition-colors duration-150
                focus:outline-none focus:ring-2 focus:ring-offset-0
                disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400
                sm:h-14 sm:w-12
                ${
                  error
                    ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                    : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'
                }
              `.trim()}
            />
          ))}
        </div>

        {error && (
          <p id={errorId} className="mt-2 text-center text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);

PinInput.displayName = 'PinInput';
