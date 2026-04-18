'use client';

import { InputHTMLAttributes, forwardRef, ReactNode } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Label text displayed above the input */
  label?: string;
  /** Error message displayed below the input */
  error?: string;
  /** Icon element rendered inside the input on the left */
  icon?: ReactNode;
}

/**
 * Reusable Input component with label, error display, and optional icon.
 * Mobile-first, accessible, Tailwind-styled.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, id, className = '', ...props }, ref) => {
    // Generate a stable id for label-input association when none provided
    const inputId = id ?? (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);
    const errorId = error && inputId ? `${inputId}-error` : undefined;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            {label}
          </label>
        )}

        <div className="relative">
          {icon && (
            <span
              className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400"
              aria-hidden="true"
            >
              {icon}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            aria-invalid={!!error}
            aria-describedby={errorId}
            className={`
              block w-full rounded-lg border bg-white px-3 py-2 text-base text-gray-900
              placeholder:text-gray-400
              transition-colors duration-150
              focus:outline-none focus:ring-2 focus:ring-offset-0
              disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400
              ${icon ? 'pl-10' : ''}
              ${
                error
                  ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                  : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500'
              }
              ${className}
            `.trim()}
            {...props}
          />
        </div>

        {error && (
          <p id={errorId} className="mt-1 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
