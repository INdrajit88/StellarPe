# Requirements Document

## Introduction

StellarPe is a mobile-first payment web application built on the Stellar blockchain testnet. The application currently has functional authentication, wallet management, payment, QR code, and dashboard features. This UI overhaul transforms StellarPe from a functional prototype into a production-ready fintech product by introducing a modern "liquid glass" landing page, a mandatory PIN gate flow, enhanced QR code and copy-to-clipboard interactions, improved user profiles, QR scanner bug fixes, and consistent visual polish across all screens. The overhaul uses a glassmorphism design language — soft gradients, backdrop blur, transparency, and smooth animations — applied uniformly via Tailwind CSS utility classes and optional Framer Motion transitions.

---

## Glossary

- **Landing_Page**: The public-facing marketing page rendered at the root URL (`/`) for unauthenticated visitors, replacing the current redirect to `/login`.
- **Navbar**: The top navigation bar displayed on the Landing_Page containing the App_Logo, menu links, and a Login button.
- **App_Logo**: A stylized gradient-and-glass alphabet-based logo ("S" or "SP") representing the StellarPe brand, displayed in the Navbar and other brand-visible locations.
- **Hero_Section**: The first visible section of the Landing_Page containing the app name, tagline, CTA buttons, and glassmorphism background cards.
- **Features_Section**: The Landing_Page section showcasing StellarPe capabilities (send/receive, QR payments, username transfers, fast transactions).
- **How_It_Works_Section**: The Landing_Page section illustrating the three-step user flow: Create, Pay, Track.
- **CTA_Section**: The Landing_Page section containing a final call-to-action prompting visitors to start using StellarPe.
- **Glass_Card**: A reusable UI component styled with semi-transparent background, backdrop blur (`backdrop-filter: blur`), soft border, and subtle shadow to achieve the glassmorphism aesthetic.
- **Toast**: A brief, auto-dismissing notification message displayed to the user after a clipboard copy action, confirming the operation succeeded.
- **PIN_Gate**: A mandatory screen presented after login that either forces PIN creation (if no PIN exists) or requires PIN verification (if a PIN exists) before granting access to the Dashboard.
- **Profile_Card**: A styled card on the user profile page displaying username, copyable Wallet ID, personal QR code, and a download QR button.
- **QR_Download**: The action of exporting a QR code as a high-resolution PNG file to the user's device.
- **System**: The StellarPe web application as a whole.
- **QR_Scanner**: The camera-based QR code scanning component (`src/components/QRScanner.tsx`) using the html5-qrcode library.
- **Dashboard**: The role-specific main screen presented to a User, Merchant, or Admin after authentication and PIN verification.
- **Bottom_Nav**: The mobile bottom navigation bar present on all authenticated User and Merchant screens.
- **Wallet_ID**: The Stellar public key (Stellar_Address) associated with a user's custodial wallet.
- **Transaction_ID**: The unique Stellar transaction hash returned after a completed payment.
- **Framer_Motion**: An optional React animation library that may be used for smooth page transitions and micro-interactions.

---

## Requirements

### Requirement 1: Landing Page — Navbar

**User Story:** As a visitor, I want to see a clean top navigation bar with the StellarPe brand logo and a login button, so that I can identify the app and navigate to authentication.

#### Acceptance Criteria

1. WHEN the Landing_Page is loaded, THE Navbar SHALL display the App_Logo on the left side, consisting of a stylized letter "S" rendered with a gradient fill and a glass-effect background.
2. WHEN the Landing_Page is loaded, THE Navbar SHALL display a "Login" button on the right side.
3. WHEN a visitor clicks the "Login" button in the Navbar, THE System SHALL navigate the visitor to the `/login` authentication page.
4. THE Navbar SHALL remain fixed at the top of the viewport during vertical scrolling on the Landing_Page.
5. THE Navbar SHALL render correctly on viewport widths from 320px to 1440px without horizontal overflow or element overlap.

---

### Requirement 2: Landing Page — Hero Section

**User Story:** As a visitor, I want to see an engaging hero section with the app name, tagline, and call-to-action buttons, so that I understand the product and can begin onboarding.

#### Acceptance Criteria

1. WHEN the Landing_Page is loaded, THE Hero_Section SHALL display the app name "StellarPe" as a prominent heading.
2. WHEN the Landing_Page is loaded, THE Hero_Section SHALL display a tagline that communicates a clean fintech value proposition.
3. WHEN the Landing_Page is loaded, THE Hero_Section SHALL display two CTA buttons labeled "Get Started" and "Login".
4. WHEN a visitor clicks the "Get Started" button, THE System SHALL navigate the visitor to the `/register` page.
5. WHEN a visitor clicks the "Login" button in the Hero_Section, THE System SHALL navigate the visitor to the `/login` page.
6. THE Hero_Section SHALL include at least one Glass_Card element rendered with a semi-transparent background (`background: rgba` with alpha below 0.5), a `backdrop-filter: blur` value of at least 8px, and a subtle border to achieve the glassmorphism aesthetic.
7. THE Hero_Section SHALL render correctly on viewport widths from 320px to 1440px, stacking elements vertically on screens narrower than 640px.

---

### Requirement 3: Landing Page — Features Section

**User Story:** As a visitor, I want to see the key features of StellarPe, so that I understand what the app offers before signing up.

#### Acceptance Criteria

1. WHEN the Landing_Page is loaded, THE Features_Section SHALL display exactly four feature items: "Send & Receive Payments", "QR Payments", "Username-Based Transfers", and "Fast & Low-Cost Transactions".
2. THE Features_Section SHALL render each feature item inside a Glass_Card with an icon, a title, and a short description.
3. THE Features_Section SHALL arrange feature cards in a responsive grid: 1 column on viewports below 640px, 2 columns on viewports from 640px to 1023px, and 4 columns on viewports 1024px and above.

---

### Requirement 4: Landing Page — How It Works Section

**User Story:** As a visitor, I want to see a simple step-by-step explanation of how StellarPe works, so that I can understand the user flow before signing up.

#### Acceptance Criteria

1. WHEN the Landing_Page is loaded, THE How_It_Works_Section SHALL display exactly three steps labeled "Create", "Pay", and "Track", each with a step number, title, and short description.
2. THE How_It_Works_Section SHALL render each step inside a Glass_Card with a visual step indicator (number or icon).
3. THE How_It_Works_Section SHALL arrange steps in a single row on viewports 640px and above, and in a single column on viewports below 640px.

---

### Requirement 5: Landing Page — CTA Section

**User Story:** As a visitor, I want to see a final call-to-action encouraging me to start using StellarPe, so that I am motivated to sign up after reviewing the page.

#### Acceptance Criteria

1. WHEN the Landing_Page is loaded, THE CTA_Section SHALL display a heading containing the text "Start using StellarPe today" or equivalent motivational copy.
2. THE CTA_Section SHALL display a prominent "Get Started" button that navigates the visitor to the `/register` page when clicked.
3. THE CTA_Section SHALL use a gradient background or Glass_Card styling consistent with the overall Landing_Page glassmorphism theme.

---

### Requirement 6: Landing Page — Animations and Visual Polish

**User Story:** As a visitor, I want smooth animations and visual transitions on the landing page, so that the app feels premium and modern.

#### Acceptance Criteria

1. THE Landing_Page SHALL apply hover transition effects (scale, shadow, or opacity change) to all interactive elements (buttons, Glass_Cards) with a transition duration between 150ms and 300ms.
2. THE Landing_Page SHALL apply entrance animations (fade-in, slide-up, or scale-in) to section content as the visitor scrolls the page into view.
3. THE Landing_Page SHALL use soft gradient backgrounds (at least two color stops) on the page body or section backgrounds.
4. THE Landing_Page SHALL load and render the above-the-fold Hero_Section content within 3 seconds on a standard 4G mobile connection.

---

### Requirement 7: App Logo Component

**User Story:** As a user, I want to see a recognizable StellarPe logo throughout the app, so that the brand identity is consistent and professional.

#### Acceptance Criteria

1. THE System SHALL provide a reusable App_Logo component that renders a stylized letter "S" with a gradient fill (at least two color stops) and a glass-effect background.
2. THE App_Logo component SHALL accept a `size` prop to render at different dimensions for use in the Navbar, profile screens, and other contexts.
3. THE App_Logo component SHALL render as an inline SVG or CSS-styled element that scales without pixelation at sizes from 24px to 128px.

---

### Requirement 8: Glass Card Reusable Component

**User Story:** As a developer, I want a reusable Glass_Card component, so that the glassmorphism design language is applied consistently across all screens.

#### Acceptance Criteria

1. THE System SHALL provide a reusable Glass_Card component that applies a semi-transparent background, `backdrop-filter: blur` of at least 8px, a subtle border (1px solid with alpha below 0.3), and a soft shadow.
2. THE Glass_Card component SHALL accept `children` and optional `className` props for content composition and style overrides.
3. THE Glass_Card component SHALL render correctly on all supported viewport widths (320px to 1440px).

---

### Requirement 9: QR Code Download

**User Story:** As a user or merchant, I want to download my QR code as a high-resolution PNG image, so that I can share it offline or print it.

#### Acceptance Criteria

1. WHEN a QR code is displayed on the user profile or merchant QR management page, THE System SHALL display a "Download QR" button adjacent to the QR code.
2. WHEN a user clicks the "Download QR" button, THE System SHALL generate a PNG image of the QR code at a minimum resolution of 512×512 pixels and trigger a browser file download with a descriptive filename (e.g., "stellarpe-qr-{username}.png").
3. THE downloaded PNG file SHALL contain a valid QR code that, when scanned, produces the same data as the on-screen QR code.

---

### Requirement 10: Copy to Clipboard — Wallet ID, Transaction ID, and Transaction Link

**User Story:** As a user, I want to copy my Wallet ID, transaction IDs, and transaction links to the clipboard with a single tap, so that I can share payment details quickly.

#### Acceptance Criteria

1. WHEN the user profile page displays the Wallet_ID, THE System SHALL render a copy icon button adjacent to the Wallet_ID text.
2. WHEN a user taps the copy icon button next to the Wallet_ID, THE System SHALL copy the full Wallet_ID string to the device clipboard and display a Toast with the message "Copied!".
3. WHEN a transaction detail or transaction list item displays a Transaction_ID, THE System SHALL render a copy icon button adjacent to the Transaction_ID text.
4. WHEN a user taps the copy icon button next to a Transaction_ID, THE System SHALL copy the full Transaction_ID string to the device clipboard and display a Toast with the message "Copied!".
5. THE Toast notification SHALL auto-dismiss after a duration between 1500ms and 3000ms.
6. THE Toast notification SHALL be positioned so it does not obscure the copied element or the Bottom_Nav.

---

### Requirement 11: QR Scanner — Camera and Permission Fixes

**User Story:** As a user, I want the QR scanner to handle camera permissions gracefully and work reliably on mobile devices, so that I can scan QR codes without encountering errors.

#### Acceptance Criteria

1. WHEN the QR_Scanner component is mounted, THE System SHALL request camera permission from the browser using the standard MediaDevices API.
2. IF the user denies camera permission, THEN THE System SHALL display a fallback UI message explaining that camera access is required for QR scanning, with instructions on how to enable it in browser settings.
3. IF the device does not have a camera or the camera API is unavailable, THEN THE System SHALL display a fallback UI message stating that QR scanning is not supported on the current device.
4. WHEN the QR_Scanner is unmounted or navigated away from, THE System SHALL stop all active camera streams to release the device camera resource.
5. THE QR_Scanner SHALL function correctly on mobile browsers (Chrome for Android, Safari for iOS) on devices with rear-facing cameras.
6. IF the camera stream encounters a runtime error after initialization, THEN THE System SHALL display a descriptive error message and provide a "Retry" button to re-initialize the scanner.

---

### Requirement 12: UI Consistency and Responsiveness Fixes

**User Story:** As a user, I want consistent spacing, aligned icons, and functional buttons across all screens, so that the app feels polished and professional.

#### Acceptance Criteria

1. THE System SHALL ensure all icon elements within buttons and navigation items are vertically centered with their adjacent text labels.
2. THE System SHALL ensure all interactive buttons across the application respond to tap and click events and navigate or submit as intended.
3. THE System SHALL apply consistent horizontal padding (minimum 16px) and vertical spacing (minimum 12px between distinct content blocks) across all page layouts.
4. THE System SHALL render all authenticated Dashboard pages correctly on viewport widths from 320px to 1440px without horizontal scrolling or content overflow.
5. THE Bottom_Nav SHALL maintain consistent icon sizing (24px × 24px) and equal spacing between navigation items across all viewport widths.

---

### Requirement 13: User Profile Enhancements

**User Story:** As a user, I want my profile page to display my username, copyable Wallet ID, personal QR code, and a download option in a clean card layout, so that I can view and share my payment identity easily.

#### Acceptance Criteria

1. WHEN a user navigates to their profile page, THE System SHALL display a Profile_Card containing: the user's username, the user's Wallet_ID with a copy button, and the user's personal QR code encoding their Stellar_Address.
2. WHEN a user navigates to their profile page, THE System SHALL display a "Download QR" button below the personal QR code that triggers a PNG download per Requirement 9.
3. THE Profile_Card SHALL be styled using the Glass_Card component or equivalent glassmorphism styling consistent with the Landing_Page design language.
4. THE Profile_Card SHALL render correctly on viewport widths from 320px to 1440px.

---

### Requirement 14: Mandatory PIN Gate After Login

**User Story:** As a user, I want to be required to set or verify my PIN immediately after login before accessing the dashboard, so that my account is secured with a second factor at every session.

#### Acceptance Criteria

1. WHEN a user successfully logs in and the user's account has no Transaction PIN set (pinHash is null), THE System SHALL redirect the user to a "Set PIN" screen before granting access to any Dashboard page.
2. WHEN a user successfully logs in and the user's account has a Transaction PIN set, THE System SHALL redirect the user to a "Verify PIN" screen before granting access to any Dashboard page.
3. WHILE the user has not completed PIN setup or verification in the current session, THE System SHALL prevent navigation to any Dashboard route and redirect back to the PIN_Gate screen.
4. WHEN the user successfully sets a new PIN on the "Set PIN" screen, THE System SHALL store the PIN via the existing PIN API endpoint and navigate the user to their role-appropriate Dashboard.
5. WHEN the user successfully verifies their PIN on the "Verify PIN" screen, THE System SHALL mark the session as PIN-verified and navigate the user to their role-appropriate Dashboard.
6. IF the user enters an incorrect PIN on the "Verify PIN" screen, THEN THE System SHALL display an error message indicating the PIN is incorrect and clear the PIN input for retry.
7. IF the user's PIN verification is locked out due to too many failed attempts, THEN THE System SHALL display a lockout message with the remaining lockout duration and disable the PIN input.
8. THE "Set PIN" and "Verify PIN" screens SHALL use the existing PinInput component and accept PINs of 4 to 6 digits.
9. THE PIN_Gate screens SHALL be styled consistently with the glassmorphism design language used on the Landing_Page.

---

### Requirement 15: Toast Notification Component

**User Story:** As a developer, I want a reusable Toast notification component, so that copy confirmations and other brief messages are displayed consistently across the app.

#### Acceptance Criteria

1. THE System SHALL provide a reusable Toast component that displays a brief text message in a fixed position on screen.
2. THE Toast component SHALL auto-dismiss after a configurable duration (default 2000ms).
3. THE Toast component SHALL be positioned at the bottom-center of the viewport, above the Bottom_Nav when present.
4. THE Toast component SHALL include a fade-in and fade-out animation with a duration between 150ms and 300ms.
5. THE Toast component SHALL be accessible, using an ARIA live region (`role="status"` or `aria-live="polite"`) so screen readers announce the message.

---

### Requirement 16: Global Design System — Glassmorphism Theme

**User Story:** As a developer, I want a consistent glassmorphism design system defined in Tailwind CSS, so that all new and existing components share the same visual language without duplicating styles.

#### Acceptance Criteria

1. THE System SHALL define reusable Tailwind CSS utility classes or CSS custom properties in `globals.css` for the glassmorphism theme, including: glass background color (semi-transparent), backdrop blur value, border style, and shadow.
2. THE System SHALL define a gradient color palette (at least a primary gradient with two color stops) used across the Landing_Page, App_Logo, buttons, and accent elements.
3. THE System SHALL ensure all new components created in this overhaul (Glass_Card, App_Logo, Toast, Landing_Page sections) use the defined theme utilities rather than inline one-off styles.
4. THE System SHALL maintain backward compatibility with existing Tailwind CSS classes used in current components (Card, Button, Input, PinInput) so that existing screens continue to render correctly.

