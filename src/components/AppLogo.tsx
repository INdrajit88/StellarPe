export interface AppLogoProps {
  /** Render size in pixels. Scales the SVG proportionally. Default: 40 */
  size?: number;
  /** Optional additional CSS classes */
  className?: string;
}

/**
 * Stylized "S" logo with gradient fill and glass-effect background.
 * Renders as an inline SVG that scales without pixelation from 24px to 128px.
 * Uses CSS custom properties from the global glassmorphism theme for gradient colors.
 *
 * @see Requirements 7.1, 7.2, 7.3
 */
export function AppLogo({ size = 40, className = '' }: AppLogoProps) {
  return (
    <div
      className={`glass-card inline-flex items-center justify-center ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.25,
        padding: size * 0.1,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="StellarPe logo"
      >
        <defs>
          <linearGradient id="logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--gradient-primary-from, #6366f1)" />
            <stop offset="100%" stopColor="var(--gradient-primary-to, #9333ea)" />
          </linearGradient>
        </defs>
        <path
          d="M38 14H24c-5.5 0-10 4.5-10 10v0c0 5.5 4.5 10 10 10h16c5.5 0 10 4.5 10 10v0c0 5.5-4.5 10-10 10H26"
          stroke="url(#logo-gradient)"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
    </div>
  );
}

AppLogo.displayName = 'AppLogo';
