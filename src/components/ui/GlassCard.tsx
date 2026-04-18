'use client';

import { forwardRef, type ReactNode, type HTMLAttributes } from 'react';

export interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Content to render inside the card */
  children: ReactNode;
  /** Optional additional CSS classes for style overrides */
  className?: string;
}

/**
 * Reusable glassmorphism card component.
 * Applies the `glass-card` CSS class from globals.css which provides:
 * semi-transparent background, backdrop blur, subtle border, and soft shadow.
 *
 * Does NOT replace the existing Card component — Card remains for opaque white cards.
 */
export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ children, className = '', ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`glass-card ${className}`.trim()}
        {...props}
      >
        {children}
      </div>
    );
  }
);

GlassCard.displayName = 'GlassCard';
