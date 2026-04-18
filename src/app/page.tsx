import { Navbar } from '@/components/landing/Navbar';
import { HeroSection } from '@/components/landing/HeroSection';
import { FeaturesSection } from '@/components/landing/FeaturesSection';
import { HowItWorksSection } from '@/components/landing/HowItWorksSection';
import { CTASection } from '@/components/landing/CTASection';

/**
 * Landing Page — the public-facing marketing page at the root URL.
 * Composes all landing sections with staggered CSS entrance animations
 * and a dark background to complement the glassmorphism design language.
 *
 * @see Requirements 6.1, 6.2, 6.3, 6.4
 */
export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950">
      <Navbar />

      {/* Hero — immediate fade-in */}
      <div
        style={{
          animation: 'fadeIn 0.6s ease-out both',
        }}
      >
        <HeroSection />
      </div>

      {/* Features — slide-up with slight delay */}
      <div
        style={{
          animation: 'slideUp 0.6s ease-out 0.15s both',
        }}
      >
        <FeaturesSection />
      </div>

      {/* How It Works — slide-up with more delay */}
      <div
        style={{
          animation: 'slideUp 0.6s ease-out 0.3s both',
        }}
      >
        <HowItWorksSection />
      </div>

      {/* CTA — slide-up with final delay */}
      <div
        style={{
          animation: 'slideUp 0.6s ease-out 0.45s both',
        }}
      >
        <CTASection />
      </div>
    </main>
  );
}
