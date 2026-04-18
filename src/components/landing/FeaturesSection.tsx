import { GlassCard } from '@/components/ui/GlassCard';

/**
 * Features section for the Landing Page.
 * Displays exactly 4 feature cards in a responsive grid:
 * - 1 column on viewports below 640px
 * - 2 columns on viewports from 640px to 1023px
 * - 4 columns on viewports 1024px and above
 *
 * Each card contains an inline SVG icon, a title, and a short description.
 *
 * @see Requirements 3.1, 3.2, 3.3
 */

const features = [
  {
    title: 'Send & Receive Payments',
    description:
      'Transfer funds instantly to anyone on the Stellar network with just a few taps.',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-10 w-10"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
        />
      </svg>
    ),
  },
  {
    title: 'QR Payments',
    description:
      'Scan or share QR codes to make and receive payments without typing addresses.',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-10 w-10"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5z"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M13.5 14.625v2.625m3.375-2.625H19.5v2.625m-6-5.25h1.875"
        />
      </svg>
    ),
  },
  {
    title: 'Username-Based Transfers',
    description:
      'Send payments using simple usernames instead of long wallet addresses.',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-10 w-10"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
        />
      </svg>
    ),
  },
  {
    title: 'Fast & Low-Cost Transactions',
    description:
      'Enjoy near-instant settlement with minimal fees on the Stellar blockchain.',
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-10 w-10"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
        />
      </svg>
    ),
  },
];

export function FeaturesSection() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20 md:px-8 lg:py-24">
      <div className="mx-auto max-w-6xl">
        <h2 className="mb-10 text-center text-3xl font-bold text-white sm:mb-12 sm:text-4xl">
          What You Can Do
        </h2>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <GlassCard
              key={feature.title}
              className="flex flex-col items-center p-6 text-center transition-all duration-200 hover:scale-105 hover:shadow-lg"
            >
              <div className="mb-4 text-white/80">{feature.icon}</div>
              <h3 className="mb-2 text-lg font-semibold text-white">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-white/70">
                {feature.description}
              </p>
            </GlassCard>
          ))}
        </div>
      </div>
    </section>
  );
}

FeaturesSection.displayName = 'FeaturesSection';
