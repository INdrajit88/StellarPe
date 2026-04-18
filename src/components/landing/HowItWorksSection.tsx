import { GlassCard } from '@/components/ui/GlassCard';

/**
 * How It Works section for the Landing Page.
 * Displays exactly 3 steps — "Create", "Pay", "Track" — each inside a GlassCard
 * with a step number, title, and short description.
 *
 * Layout: single column below 640px, single row at 640px and above.
 *
 * @see Requirements 4.1, 4.2, 4.3
 */

const steps = [
  {
    number: 1,
    title: 'Create',
    description:
      'Sign up in seconds and get your own Stellar wallet with a unique username.',
  },
  {
    number: 2,
    title: 'Pay',
    description:
      'Send payments instantly using usernames or QR codes — no long addresses needed.',
  },
  {
    number: 3,
    title: 'Track',
    description:
      'Monitor your transactions in real time and keep full control of your finances.',
  },
];

export function HowItWorksSection() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20 md:px-8 lg:py-24">
      <div className="mx-auto max-w-5xl">
        <h2 className="mb-10 text-center text-3xl font-bold text-white sm:mb-12 sm:text-4xl">
          How It Works
        </h2>

        <div className="flex flex-col gap-6 sm:flex-row">
          {steps.map((step) => (
            <GlassCard
              key={step.title}
              className="flex flex-1 flex-col items-center p-6 text-center transition-all duration-200 hover:scale-105 hover:shadow-lg"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-xl font-bold text-white">
                {step.number}
              </div>
              <h3 className="mb-2 text-lg font-semibold text-white">
                {step.title}
              </h3>
              <p className="text-sm leading-relaxed text-white/70">
                {step.description}
              </p>
            </GlassCard>
          ))}
        </div>
      </div>
    </section>
  );
}

HowItWorksSection.displayName = 'HowItWorksSection';
