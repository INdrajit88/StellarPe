'use client';

import { HTMLAttributes, forwardRef, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Optional header content rendered at the top of the card */
  header?: ReactNode;
  /** Optional footer content rendered at the bottom of the card */
  footer?: ReactNode;
}

/**
 * Reusable Card container with optional header/footer, shadow, and rounded corners.
 * Mobile-first, accessible, Tailwind-styled.
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ header, footer, children, className = '', ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`rounded-xl border border-gray-200 bg-white text-gray-900 shadow-sm ${className}`}
        {...props}
      >
        {header && (
          <div className="border-b border-gray-200 px-4 py-3 sm:px-6">
            {header}
          </div>
        )}

        <div className="px-4 py-4 sm:px-6">{children}</div>

        {footer && (
          <div className="border-t border-gray-200 px-4 py-3 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    );
  }
);

Card.displayName = 'Card';
