# Implementation Plan: StellarPe UI Overhaul

## Overview

This plan transforms StellarPe from a functional prototype into a polished, production-ready fintech product. Tasks are ordered so foundational pieces (global theme, reusable components) come first, then the landing page, then bug fixes and enhancements, then the PIN gate flow, and finally integration wiring and tests. Each task builds incrementally on previous work.

## Tasks

- [x] 1. Set up glassmorphism design system in globals.css
  - [x] 1.1 Add CSS custom properties and utility classes to `src/app/globals.css`
    - Add `:root` variables: `--glass-bg`, `--glass-border`, `--glass-shadow`, `--glass-blur`, `--gradient-primary-from`, `--gradient-primary-to`, `--gradient-accent-from`, `--gradient-accent-to`
    - Add `.glass-card` class with `background`, `backdrop-filter`, `-webkit-backdrop-filter`, `border`, `box-shadow`, `border-radius`
    - Add `.gradient-primary` and `.gradient-accent` utility classes
    - Add CSS `@keyframes` for entrance animations (`fadeIn`, `slideUp`, `scaleIn`)
    - Ensure existing Tailwind classes for Card, Button, Input, PinInput remain unaffected
    - _Requirements: 16.1, 16.2, 16.3, 16.4_

- [x] 2. Create reusable shared components
  - [x] 2.1 Create AppLogo component (`src/components/AppLogo.tsx`)
    - Render a stylized "S" letter as an inline SVG with gradient fill (`from-indigo-500 to-purple-600`) inside a glass-effect rounded container
    - Accept a `size` prop (default 40) and optional `className` prop
    - Use `viewBox` so the SVG scales without pixelation from 24px to 128px
    - Use CSS custom properties from the global theme for gradient colors
    - _Requirements: 7.1, 7.2, 7.3_

  - [ ]* 2.2 Write property test for AppLogo scaling (Property 1)
    - **Property 1: AppLogo scales proportionally for any valid size**
    - Use `fc.integer({ min: 24, max: 128 })` for size
    - Verify rendered SVG width and height equal the specified size
    - **Validates: Requirements 7.2, 7.3**

  - [x] 2.3 Create GlassCard component (`src/components/ui/GlassCard.tsx`)
    - Create a `<div>` that applies the `glass-card` CSS class from globals.css
    - Accept `children`, optional `className`, and forward refs via `forwardRef`
    - Spread remaining HTML div attributes
    - Do NOT replace the existing `Card` component
    - _Requirements: 8.1, 8.2, 8.3_

  - [ ]* 2.4 Write property test for GlassCard rendering (Property 2)
    - **Property 2: GlassCard renders arbitrary children and applies className**
    - Use `fc.string()` for className, `fc.string({ minLength: 1 })` for children text
    - Verify container includes children in DOM subtree and has provided className in class list
    - **Validates: Requirements 8.2**

  - [x] 2.5 Create Toast system (`src/components/ui/Toast.tsx` + `src/contexts/ToastContext.tsx`)
    - Create `ToastProvider` that maintains a `toasts` state array and renders toasts in a portal attached to `document.body`
    - Create `useToast()` hook exposing `show(message, duration?)` method
    - Position toasts `fixed bottom-20 left-1/2 -translate-x-1/2` (above BottomNav)
    - Use `role="status"` and `aria-live="polite"` for accessibility
    - Implement fade-in/fade-out via CSS transitions (200ms)
    - Auto-dismiss after configurable duration (default 2000ms)
    - Queue multiple toasts vertically, max 3 visible, debounce identical messages within 500ms
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_

  - [ ]* 2.6 Write property test for Toast auto-dismiss timing (Property 6)
    - **Property 6: Toast auto-dismisses after configured duration**
    - Use `fc.integer({ min: 1500, max: 3000 })` for duration
    - Verify Toast is present before duration and removed after duration (±100ms tolerance)
    - **Validates: Requirements 10.5, 15.2**

  - [x] 2.7 Create CopyButton component (`src/components/CopyButton.tsx`)
    - Render an icon button (clipboard SVG icon) that calls `navigator.clipboard.writeText(value)` on click
    - Trigger `useToast().show("Copied!")` on success
    - Fall back to `document.execCommand('copy')` for older browsers
    - Show a brief checkmark icon for 1.5s after successful copy
    - Accept `value`, optional `label` (default "Copy to clipboard"), and optional `className` props
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [ ]* 2.8 Write property test for CopyButton clipboard fidelity (Property 5)
    - **Property 5: CopyButton copies exact string to clipboard**
    - Use `fc.string({ minLength: 1, maxLength: 500 })` for values
    - Mock `navigator.clipboard.writeText` and verify it receives the exact string
    - **Validates: Requirements 10.2, 10.4**

  - [x] 2.9 Create QRDownloadButton component (`src/components/QRDownloadButton.tsx`)
    - Accept `qrRef` (RefObject to container holding QRCodeSVG), `filename`, optional `resolution` (default 512), optional `className`
    - On click: serialize SVG via `XMLSerializer`, create `Image` from SVG data URL, draw onto `<canvas>` at specified resolution, call `canvas.toDataURL('image/png')`, trigger download via temporary `<a>` element
    - Handle errors: SVG not found → button disabled or error toast, canvas/image failures → error toast
    - _Requirements: 9.1, 9.2, 9.3_

  - [ ]* 2.10 Write property test for QR PNG download dimensions (Property 3)
    - **Property 3: QR PNG download produces correct dimensions**
    - Use `fc.string({ minLength: 1, maxLength: 200 })` for QR data, `fc.integer({ min: 512, max: 2048 })` for resolution
    - Verify produced PNG data URL decodes to image with correct width and height
    - **Validates: Requirements 9.2**

  - [x] 2.11 Create ProfileCard component (`src/components/ProfileCard.tsx`)
    - Render a GlassCard containing: avatar placeholder (initials circle), username, Wallet ID with adjacent CopyButton, QRCodeDisplay encoding the Stellar address, and QRDownloadButton below the QR code
    - Accept `username`, `walletId`, `stellarAddress` props
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

- [x] 3. Checkpoint — Verify reusable components
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Wrap root layout with ToastProvider
  - [x] 4.1 Update Root Layout (`src/app/layout.tsx`)
    - Wrap `{children}` with `<ToastProvider>`
    - Update metadata: title to "StellarPe", description to appropriate fintech copy
    - _Requirements: 15.1, 16.3_

- [x] 5. Build the Landing Page
  - [x] 5.1 Create Navbar component (`src/components/landing/Navbar.tsx`)
    - Fixed top, glass background using `glass-card` class
    - AppLogo on the left, "Login" button on the right linking to `/login`
    - Responsive from 320px to 1440px
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 5.2 Create HeroSection component (`src/components/landing/HeroSection.tsx`)
    - Display "StellarPe" heading, tagline, two CTA buttons ("Get Started" → `/register`, "Login" → `/login`)
    - Include at least one GlassCard with semi-transparent background and backdrop blur ≥ 8px
    - Gradient background using `.gradient-primary`
    - Responsive: stack vertically below 640px
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

  - [x] 5.3 Create FeaturesSection component (`src/components/landing/FeaturesSection.tsx`)
    - Display exactly 4 feature GlassCards: "Send & Receive Payments", "QR Payments", "Username-Based Transfers", "Fast & Low-Cost Transactions"
    - Each card has an icon, title, and short description
    - Responsive grid: 1 col < 640px, 2 cols 640–1023px, 4 cols ≥ 1024px
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 5.4 Create HowItWorksSection component (`src/components/landing/HowItWorksSection.tsx`)
    - Display exactly 3 steps: "Create", "Pay", "Track" inside GlassCards with step numbers
    - Single row ≥ 640px, single column < 640px
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 5.5 Create CTASection component (`src/components/landing/CTASection.tsx`)
    - Heading with motivational copy ("Start using StellarPe today" or equivalent)
    - Prominent "Get Started" button → `/register`
    - Gradient background or GlassCard styling
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 5.6 Compose Landing Page (`src/app/page.tsx`)
    - Replace the current `redirect('/login')` with the full landing page composition
    - Render Navbar, HeroSection, FeaturesSection, HowItWorksSection, CTASection in order
    - Add entrance animations (fade-in, slide-up) using IntersectionObserver or CSS animations
    - Add hover transitions (scale, shadow, opacity) to interactive elements (150–300ms)
    - Apply soft gradient backgrounds
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [ ]* 5.7 Write unit tests for Landing Page components
    - Navbar renders AppLogo and Login button, Login button links to `/login`
    - HeroSection renders heading, tagline, both CTA buttons with correct hrefs
    - FeaturesSection renders exactly 4 feature cards
    - HowItWorksSection renders exactly 3 steps
    - CTASection renders heading and Get Started button linking to `/register`
    - _Requirements: 1.1–1.5, 2.1–2.7, 3.1–3.3, 4.1–4.3, 5.1–5.3_

- [x] 6. Checkpoint — Verify landing page renders correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Fix QR Scanner camera and permission handling
  - [x] 7.1 Enhance QRScanner component (`src/components/QRScanner.tsx`)
    - Add pre-flight `navigator.mediaDevices.getUserMedia({ video: true })` check before initializing `html5-qrcode`
    - Discriminate error types: `NotAllowedError` → permission denied UI with instructions, `NotFoundError` → no camera UI, `NotReadableError` → camera in use UI
    - Add a "Retry" button that re-runs the initialization sequence
    - Harden unmount cleanup with a `mounted` flag and error swallowing on `scanner.clear()`
    - Ensure all active camera streams are stopped on unmount/navigation
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [ ]* 7.2 Write unit tests for QRScanner error handling
    - Mock `navigator.mediaDevices.getUserMedia` to simulate permission denied, no camera, and runtime errors
    - Verify correct fallback UI messages for each error type
    - Verify Retry button re-initializes scanner
    - Verify camera streams stopped on unmount
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.6_

- [x] 8. Enhance user profile and merchant QR pages
  - [x] 8.1 Update User Profile page (`src/app/(dashboard)/user/profile/page.tsx`)
    - Replace inline user info card with ProfileCard component
    - Add CopyButton next to Wallet ID
    - Add QRCodeDisplay with personal QR code encoding Stellar address
    - Add QRDownloadButton below QR code
    - Apply glassmorphism styling via GlassCard
    - _Requirements: 13.1, 13.2, 13.3, 13.4_

  - [x] 8.2 Update Merchant QR page (`src/app/(dashboard)/merchant/qr/page.tsx`)
    - Add QRDownloadButton next to each QR code display (static and dynamic)
    - Add CopyButton next to the Stellar address display
    - _Requirements: 9.1, 10.1, 10.2_

  - [x] 8.3 Update TransactionList component (`src/components/TransactionList.tsx`)
    - Add CopyButton next to `stellarTxId` display for each transaction that has one
    - _Requirements: 10.3, 10.4_

- [x] 9. Apply UI consistency and responsiveness fixes
  - [x] 9.1 Fix spacing, alignment, and responsiveness across dashboard pages
    - Ensure all icon elements within buttons and nav items are vertically centered with adjacent text
    - Ensure consistent horizontal padding (min 16px) and vertical spacing (min 12px between content blocks)
    - Ensure all dashboard pages render correctly from 320px to 1440px without horizontal scrolling
    - Ensure BottomNav maintains consistent icon sizing (24×24) and equal spacing
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [x] 10. Checkpoint — Verify enhancements and fixes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement mandatory PIN Gate flow
  - [x] 11.1 Create POST `/api/users/pin/verify` endpoint (`src/app/api/users/pin/verify/route.ts`)
    - Accept `{ pin: string }` in request body
    - Call `PINService.verifyPin()` and return result
    - Return 200 `{ verified: true }` on match
    - Return 401 `{ error: "Incorrect PIN", attemptsRemaining: number }` on mismatch
    - Return 423 `{ error: "Account locked", lockedUntil: string }` on lockout
    - Include CSRF validation, JWT auth, and role guard middleware
    - _Requirements: 14.2, 14.5, 14.6, 14.7_

  - [ ]* 11.2 Write unit tests for PIN verify endpoint
    - Test successful verification returns 200
    - Test incorrect PIN returns 401 with attemptsRemaining
    - Test locked account returns 423 with lockedUntil
    - Test missing/invalid CSRF returns 403
    - _Requirements: 14.5, 14.6, 14.7_

  - [x] 11.3 Create PinGateScreen component (`src/components/PinGateScreen.tsx`)
    - Accept `mode: 'set' | 'verify'` and `onSuccess` callback props
    - Render PinInput component (4–6 digits, masked)
    - In "set" mode: call POST `/api/users/pin` on complete, on success call `onSuccess`
    - In "verify" mode: call POST `/api/users/pin/verify` on complete, on success call `onSuccess`
    - Display inline error messages for incorrect PIN, lockout with countdown timer, network errors
    - Clear PIN input on error
    - Style with glassmorphism design language (GlassCard)
    - _Requirements: 14.1, 14.2, 14.5, 14.6, 14.7, 14.8, 14.9_

  - [ ]* 11.4 Write property test for PIN Gate screen selection (Property 7)
    - **Property 7: PIN Gate displays correct screen based on user PIN state**
    - Use `fc.record({ pinHash: fc.option(fc.string({ minLength: 1 })) })` for user state
    - Verify: pinHash null → "Set PIN" screen, pinHash non-empty → "Verify PIN" screen
    - **Validates: Requirements 14.1, 14.2**

  - [ ]* 11.5 Write property test for PIN Gate route blocking (Property 8)
    - **Property 8: PIN Gate prevents dashboard access when session is unverified**
    - Use `fc.constantFrom('/user', '/user/send', '/merchant', '/merchant/qr')` for routes
    - Verify: unverified session → PIN Gate screen displayed instead of dashboard content
    - **Validates: Requirements 14.3**

  - [x] 11.6 Integrate PIN Gate into Dashboard Layout (`src/app/(dashboard)/layout.tsx`)
    - After confirming auth, check `sessionStorage.getItem('pinVerified')`
    - If not verified, check `user.pinHash` from localStorage to determine set vs verify mode
    - Render PinGateScreen instead of `children` when not verified
    - On successful PIN action, set `sessionStorage.setItem('pinVerified', 'true')` and re-render dashboard
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

- [x] 12. Checkpoint — Verify PIN Gate flow end-to-end
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Final integration and backward compatibility verification
  - [x] 13.1 Wire all components together and verify integration
    - Verify Toast works with CopyButton across profile and transaction pages
    - Verify QRDownloadButton works on user profile and merchant QR pages
    - Verify Landing Page navigations (Login → `/login`, Get Started → `/register`) work correctly
    - Verify PIN Gate → Dashboard flow: login → PIN Gate → verify/set → dashboard accessible
    - Verify existing Card, Button, Input, PinInput components render unchanged after CSS additions
    - _Requirements: 16.4, 10.2, 10.4, 9.2, 14.4, 14.5_

  - [ ]* 13.2 Write integration tests
    - Landing page full render: all sections present
    - PIN Gate → Dashboard flow: login → PIN Gate → verify → dashboard accessible
    - Copy + Toast flow: copy action → clipboard updated → toast appears → toast dismisses
    - QR download flow: QR displayed → download button → PNG file triggered
    - _Requirements: 1.1–5.3, 14.1–14.5, 10.2, 10.4, 9.1–9.3_

- [x] 14. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major phase
- Property tests validate universal correctness properties from the design document using `fast-check`
- Unit tests use Jest + React Testing Library (already configured)
- The project uses TypeScript throughout (Next.js + React)
- Existing components (Card, Button, Input, PinInput) are NOT modified — backward compatibility is a hard constraint
- No new animation library (Framer Motion) is added — CSS animations and IntersectionObserver are used instead
