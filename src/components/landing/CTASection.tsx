import Link from 'next/link';

/**
 * Call-to-action section for the Landing Page.
 * Displays a motivational heading and a prominent "Get Started" button
 * on a gradient-accent background, encouraging visitors to sign up.
 *
 * @see Requirements 5.1, 5.2, 5.3
 */
export function CTASection() {
  return (
    <section className="gradient-accent px-4 py-16 sm:px-6 sm:py-20 md:px-8 lg:py-24">
      <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
        <h2 className="text-3xl font-bold text-white sm:text-4xl md:text-5xl">
          Start using StellarPe today
        </h2>

        <p className="mt-4 max-w-xl text-base text-white/80 sm:mt-6 sm:text-lg">
          Join thousands of users making fast, secure, and low-cost payments on
          the Stellar network. Your wallet is just a click away.
        </p>

        <Link
          href="/register"
          className="mt-8 rounded-xl bg-white px-10 py-3 text-base font-semibold text-indigo-600 shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl sm:mt-10 sm:px-12 sm:py-4 sm:text-lg"
        >
          Get Started
        </Link>
      </div>
    </section>
  );
}

CTASection.displayName = 'CTASection';
