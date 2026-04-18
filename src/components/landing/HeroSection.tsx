import Link from 'next/link';
import { GlassCard } from '@/components/ui/GlassCard';

/**
 * Hero section for the Landing Page.
 * Displays the "StellarPe" heading, a fintech tagline, two CTA buttons,
 * and decorative GlassCard elements on a gradient-primary background.
 * Stacks vertically on screens narrower than 640px.
 *
 * @see Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
 */
export function HeroSection() {
  return (
    <section className="gradient-primary relative min-h-screen overflow-hidden px-4 pt-28 pb-16 sm:px-6 sm:pt-32 md:px-8 lg:pt-40">
      {/* Decorative floating GlassCard elements */}
      <div
        className="pointer-events-none absolute top-20 -left-16 h-64 w-64 rotate-12 opacity-30 sm:top-24 sm:-left-8 sm:h-80 sm:w-80"
        aria-hidden="true"
      >
        <GlassCard className="h-full w-full">{null}</GlassCard>
      </div>
      <div
        className="pointer-events-none absolute right-[-3rem] bottom-16 h-48 w-48 -rotate-12 opacity-20 sm:right-[-1rem] sm:h-72 sm:w-72"
        aria-hidden="true"
      >
        <GlassCard className="h-full w-full">{null}</GlassCard>
      </div>

      {/* Main content */}
      <div className="relative z-10 mx-auto flex max-w-5xl flex-col items-center text-center">
        <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl">
          StellarPe
        </h1>

        <p className="mt-4 max-w-2xl text-lg text-white/80 sm:mt-6 sm:text-xl md:text-2xl">
          Fast, secure, and low-cost payments powered by the Stellar network.
          Send money to anyone, anywhere, in seconds.
        </p>

        {/* CTA Buttons — stack vertically below 640px */}
        <div className="mt-8 flex w-full flex-col items-center gap-4 sm:mt-10 sm:w-auto sm:flex-row sm:gap-6">
          <Link
            href="/register"
            className="w-full rounded-xl bg-white px-8 py-3 text-center text-base font-semibold text-indigo-600 shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl sm:w-auto"
          >
            Get Started
          </Link>
          <Link
            href="/login"
            className="w-full rounded-xl border border-white/30 bg-white/10 px-8 py-3 text-center text-base font-semibold text-white backdrop-blur-sm transition-all duration-200 hover:scale-105 hover:bg-white/20 sm:w-auto"
          >
            Login
          </Link>
        </div>

        {/* Featured GlassCard — satisfies requirement 2.6 */}
        <GlassCard className="mt-12 w-full max-w-lg p-6 sm:mt-16 sm:p-8">
          <div className="flex flex-col items-center gap-3 text-white">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-10 w-10 opacity-80"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm font-medium text-white/70">
              Trusted by thousands for everyday payments
            </p>
          </div>
        </GlassCard>
      </div>
    </section>
  );
}

HeroSection.displayName = 'HeroSection';
