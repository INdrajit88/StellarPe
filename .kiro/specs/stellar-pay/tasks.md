# Implementation Plan: StellarPay

## Overview

Convert the StellarPay feature design into incremental implementation tasks. The stack is Next.js App Router + Tailwind CSS + PostgreSQL/Prisma + Stellar SDK + JWT auth + SSE notifications, all in TypeScript with strict mode. Tasks are ordered so each builds on the previous, ending with full wiring and integration.

## Tasks

- [x] 1. Project scaffolding, environment config, and Prisma schema
  - [x] 1.1 Initialize Next.js project with TypeScript strict mode, Tailwind CSS, and install core dependencies (`@stellar/stellar-sdk`, `prisma`, `@prisma/client`, `bcryptjs`, `jsonwebtoken`, `zod`, `qrcode`, `qrcode.react`, `html5-qrcode`, `fast-check`, `jest`, `ts-jest`, `supertest`)
    - Configure `tsconfig.json` with `strict: true`
    - Configure `jest.config.ts` with `ts-jest` preset, test match patterns for `*.test.ts` and `*.property.test.ts`
    - _Requirements: 15.5, 14.1_

  - [x] 1.2 Create `.env.example` with all required environment variable keys and implement environment validation module (`src/lib/env.ts`)
    - Keys: `DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_MASTER_KEY`, `STELLAR_NETWORK_PASSPHRASE`, `HORIZON_URL`
    - Validation: log descriptive error naming missing variable and terminate process if any required variable is absent
    - Default `HORIZON_URL` to `https://horizon-testnet.stellar.org` when not provided
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [x] 1.3 Create Prisma schema (`prisma/schema.prisma`) with all models: `User`, `Wallet`, `Transaction`, `Contact`, `MerchantProfile` with enums `Role`, `AccountStatus`, `TransactionStatus`
    - Include all indexes and unique constraints from the design
    - Use `Decimal(20,7)` for transaction amounts
    - Set up Prisma client singleton at `src/lib/prisma.ts`
    - Run `prisma generate` and `prisma db push` (or `prisma migrate dev`)
    - _Requirements: 15.3_

  - [x] 1.4 Set up project directory structure following the design conventions
    - Create `src/lib/services/`, `src/lib/middleware/`, `src/lib/validators/`, `src/lib/utils/`, `src/components/ui/`, `test/unit/`, `test/property/`, `test/integration/`, `test/helpers/`
    - Create test setup file (`test/setup.ts`) for database setup/teardown
    - Create test helper stubs: `test/helpers/factories.ts` and `test/helpers/mocks.ts`
    - _Requirements: 15.1, 15.2_

- [x] 2. Checkpoint – Verify project builds and Prisma schema is valid
  - Ensure `npm run build` succeeds, `prisma generate` completes, and the test runner can execute a trivial test. Ask the user if questions arise.

- [x] 3. EncryptionService and PINService
  - [x] 3.1 Implement `EncryptionService` (`src/lib/services/encryption.service.ts`)
    - `encrypt(plaintext)`: AES-256-GCM encryption with random IV, returns `{ ciphertext, iv, authTag }`
    - `decrypt(ciphertext, iv, authTag)`: AES-256-GCM decryption and authentication
    - Derive encryption key from `ENCRYPTION_MASTER_KEY` env var using HKDF
    - Never log or expose plaintext keys
    - _Requirements: 2.3, 2.7, 13.3_

  - [x] 3.2 Write property test for EncryptionService round-trip
    - **Property 7: Encryption round-trip preserves secret key**
    - Generate random strings with fast-check; encrypt then decrypt; assert output equals original input
    - **Validates: Requirements 2.3**

  - [x] 3.3 Implement `PINService` (`src/lib/services/pin.service.ts`)
    - `setPin(userId, pin)`: Validate 4-6 digit format, hash with bcrypt (cost factor ≥ 12), store hash
    - `verifyPin(userId, pin)`: Compare against stored hash, track failed attempts, enforce lockout (5 failures in 15 min → 15-min lock)
    - `isLocked(userId)`: Check if account is in PIN lockout period
    - `resetPin(userId, newPin)`: Update hash, invalidate all sessions
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 3.4 Write property tests for PINService
    - **Property 14: PIN validation accepts only 4-6 digit strings**
    - **Property 15: PIN hash round-trip**
    - **Property 16: Lockout after 5 consecutive failures**
    - **Validates: Requirements 4.1, 4.2, 4.5, 13.5**

- [x] 4. StellarService and WalletService
  - [x] 4.1 Implement `StellarService` (`src/lib/services/stellar.service.ts`)
    - `generateKeypair()`: Generate Stellar keypair using Stellar SDK
    - `fundAccount(publicKey)`: Fund via Friendbot with up to 3 retries (1-second delay between retries)
    - `getBalance(publicKey)`: Query Horizon for XLM balance
    - `submitPayment(senderSecret, recipientPublic, amount, memo?)`: Build, sign, and submit payment operation
    - `streamPayments(publicKey, onPayment)`: Open Horizon streaming cursor for inbound payments
    - Configure Stellar SDK with `HORIZON_URL` and `STELLAR_NETWORK_PASSPHRASE` from env
    - _Requirements: 2.1, 2.2, 2.5, 2.6, 3.5, 3.6, 5.2_

  - [x] 4.2 Implement `WalletService` (`src/lib/services/wallet.service.ts`)
    - `createWallet(userId)`: Generate keypair, fund via Friendbot, encrypt secret key with EncryptionService, store wallet record
    - `getWalletDetails(userId)`: Return Stellar address and live XLM balance from Horizon
    - `decryptSecretKey(userId)`: Decrypt secret key for transaction signing (internal only, never expose)
    - Ensure plaintext secret key is never returned in any response or logged
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [x] 4.3 Write property test for secret key not exposed
    - **Property 8: Secret key never exposed in API responses or database plaintext**
    - Verify wallet database records contain only ciphertext (not the plaintext key) and API responses omit the secret key
    - **Validates: Requirements 2.1, 2.4, 2.7**

- [x] 5. AuthService, JWT middleware, and Zod validators
  - [x] 5.1 Implement Zod validation schemas (`src/lib/validators/`)
    - `auth.validator.ts`: Registration schema (username, email, password, role), login schema (email, password)
    - `payment.validator.ts`: Send payment schema (recipient, amount, pin, memo?), history filter schema
    - `contact.validator.ts`: Create/update contact schema
    - `qr.validator.ts`: Dynamic QR schema (amount, description?), QR parse schema
    - `pin.validator.ts`: PIN set/reset schema (4-6 digit validation)
    - `admin.validator.ts`: Account status update schema, user search schema
    - _Requirements: 13.4, 4.1_

  - [x] 5.2 Implement `AuthService` (`src/lib/services/auth.service.ts`)
    - `register(data)`: Validate input, check duplicate username/email, hash password with bcrypt, create User record, trigger WalletService.createWallet, return JWT
    - `login(data)`: Validate credentials, check account status (active/inactive), check login lockout, issue JWT with ≤ 24-hour expiry
    - `validateToken(token)`: Verify JWT signature and expiry, return `{ userId, role }`
    - Return generic "invalid credentials" message on failed login (do not reveal which field is wrong)
    - Track failed login attempts; lock account after 5 consecutive failures for 15 minutes
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 13.5_

  - [x] 5.3 Implement middleware stack
    - `src/middleware.ts`: JWT authentication middleware for all `/api/*` routes except `/api/auth/*`; attach `userId` and `role` to request context
    - `src/lib/middleware/rate-limiter.ts`: In-memory sliding window rate limiter; auth endpoints: 10 req/IP/min; payment endpoints: 20 req/user/min; return 429 when exceeded
    - `src/lib/middleware/role-guard.ts`: Validate user role against required role per route; return 403 for unauthorized
    - `src/lib/middleware/validator.ts`: Zod schema validation wrapper; return 400 with structured error messages
    - `src/lib/middleware/csrf.ts`: CSRF protection on all state-mutating endpoints (POST, PUT, DELETE)
    - _Requirements: 1.6, 13.1, 13.2, 13.4, 13.7, 12.6_

  - [x] 5.4 Write property tests for auth and middleware
    - **Property 1: Registration creates user with linked wallet**
    - **Property 2: Duplicate registration fields are rejected**
    - **Property 3: JWT expiry is bounded**
    - **Property 4: Invalid credentials produce generic 401**
    - **Property 5: Expired or absent JWT rejects with 401**
    - **Property 6: Missing registration fields listed in error**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7**

  - [x] 5.5 Write property tests for rate limiter and CSRF
    - **Property 31: Auth endpoint rate limiting**
    - **Property 32: Payment endpoint rate limiting**
    - **Property 33: CSRF protection on state-mutating endpoints**
    - **Validates: Requirements 13.1, 13.2, 13.7**

- [x] 6. Checkpoint – Verify core services and auth flow
  - Ensure all tests pass, ask the user if questions arise. Registration → wallet creation → JWT issuance should work end-to-end in tests.

- [x] 7. Auth API routes and frontend auth pages
  - [x] 7.1 Implement auth API route handlers
    - `POST /api/auth/register`: Accept registration payload, call AuthService.register, return JWT and user data
    - `POST /api/auth/login`: Accept login payload, call AuthService.login, return JWT and user data
    - Wire Zod validation and rate limiting middleware
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.7, 13.1_

  - [x] 7.2 Implement reusable UI components (`src/components/ui/`)
    - `Button.tsx`, `Input.tsx`, `Card.tsx`, `Modal.tsx`: Tailwind-styled, mobile-first, accessible primitives
    - `PinInput.tsx`: Numeric PIN input (4-6 digits), works on standard mobile browser numeric keyboard
    - _Requirements: 4.8, 10.2, 2.8_

  - [x] 7.3 Implement auth pages (`src/app/(auth)/`)
    - `login/page.tsx`: Email + password form, error display, link to register
    - `register/page.tsx`: Username + email + password + role selection form, validation errors, redirect to PIN setup on success
    - Store JWT in httpOnly cookie or secure client storage
    - _Requirements: 1.1, 1.4, 1.5_

- [x] 8. PaymentService, ContactService, and QRService
  - [x] 8.1 Implement `PaymentService` (`src/lib/services/payment.service.ts`)
    - `sendPayment(data)`: Full flow — resolve recipient (username or Stellar address), check balance ≥ amount + 1 XLM reserve, verify PIN, decrypt secret key, sign and submit via StellarService, record transaction (completed/failed), zero secret key from memory
    - `resolveRecipient(identifier)`: Resolve username to Stellar address; return error if not found
    - `getTransactionHistory(userId, filters)`: Paginated list (20/page default), support date range, direction (sent/received), status filters applied conjunctively
    - _Requirements: 3.1–3.10, 8.1–8.7, 9.1–9.4_

  - [x] 8.2 Write property tests for payment and transaction
    - **Property 9: Username resolves to correct Stellar address**
    - **Property 10: Non-existent recipient identifier returns error**
    - **Property 11: Incorrect PIN rejects payment**
    - **Property 12: Transaction recording preserves status and data**
    - **Property 13: Insufficient balance is caught before submission**
    - **Validates: Requirements 3.1, 3.2, 3.4, 3.6, 3.7, 3.8, 9.2, 9.3**

  - [x] 8.3 Write property tests for transaction history
    - **Property 25: Transaction history filters applied conjunctively**
    - **Property 26: Transaction records contain all required fields**
    - **Validates: Requirements 8.2, 8.3, 8.4, 8.5, 8.6**

  - [x] 8.4 Implement `ContactService` (`src/lib/services/contact.service.ts`)
    - `createContact(userId, data)`: Validate Stellar address or username exists before saving; reject duplicates
    - `listContacts(userId)`: Return contacts alphabetically by displayName (case-insensitive)
    - `updateContact(userId, contactId, data)`: Update display name or address
    - `deleteContact(userId, contactId)`: Remove contact
    - _Requirements: 6.1–6.6_

  - [x] 8.5 Write property tests for ContactService
    - **Property 19: Contact creation validates existence and stores correctly**
    - **Property 20: Contacts are returned in alphabetical order**
    - **Property 21: Duplicate contacts are rejected**
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.6**

  - [x] 8.6 Implement `QRService` (`src/lib/services/qr.service.ts`)
    - `generateStaticQR(stellarAddress)`: Generate PNG QR encoding the Stellar address, minimum 256×256 px
    - `generateDynamicQR(stellarAddress, amount, description?)`: Generate PNG QR with address + amount + description
    - `parseQRPayload(data)`: Parse and validate QR payload; reject invalid Stellar addresses (not 56-char valid public key)
    - _Requirements: 7.1–7.6_

  - [x] 8.7 Write property tests for QRService
    - **Property 22: QR code round-trip**
    - **Property 23: QR code format and dimensions**
    - **Property 24: Invalid Stellar address rejected by QR parser**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.5, 7.6**

- [x] 9. Checkpoint – Verify payment, contact, and QR services
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Username search, NotificationService, and AdminService
  - [x] 10.1 Implement username autocomplete endpoint logic
    - Add method to search users by partial username prefix (case-insensitive), return up to 10 results
    - _Requirements: 9.5_

  - [x] 10.2 Write property tests for username features
    - **Property 27: Username-to-address mapping is unique**
    - **Property 28: Username autocomplete returns prefix matches limited to 10**
    - **Validates: Requirements 9.1, 9.5**

  - [x] 10.3 Implement `NotificationService` (`src/lib/services/notification.service.ts`)
    - `subscribe(userId, controller)`: Register SSE connection for a user
    - `unsubscribe(userId)`: Remove SSE connection
    - `notifyPaymentReceived(userId, transaction)`: Push payment event to user's SSE stream
    - `startHorizonStreaming()`: Initialize Horizon payment streams for all registered Stellar addresses; relay inbound payment events to connected clients
    - Implement exponential backoff reconnection: `min(2^N × baseInterval, 30000)` ms
    - Record inbound transactions in the database when received via Horizon stream
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 10.4 Write property test for exponential backoff
    - **Property 18: Exponential backoff for Horizon reconnection**
    - **Validates: Requirements 5.5**

  - [x] 10.5 Implement `AdminService` (`src/lib/services/admin.service.ts`)
    - `getDashboardStats()`: Aggregate user count, merchant count, transaction count, total XLM volume, failed transactions in last 24h
    - `listUsers(page, search?)`: Paginated user list (25/page) with optional username/email search
    - `setAccountStatus(userId, status)`: Set account to active/inactive; Auth_Provider rejects login for inactive accounts
    - _Requirements: 12.1–12.6_

  - [x] 10.6 Write property tests for admin and account lifecycle
    - **Property 29: Account activation/deactivation round-trip**
    - **Property 30: Admin-only endpoint access**
    - **Validates: Requirements 12.4, 12.5, 12.6**

  - [x] 10.7 Write property test for environment configuration
    - **Property 34: Missing environment variable terminates startup**
    - **Validates: Requirements 14.3**

  - [x] 10.8 Write property test for PIN change session invalidation
    - **Property 17: PIN change invalidates all sessions**
    - **Validates: Requirements 4.7**
\
- [x] 11. API route handlers for all endpoints
  - [x] 11.1 Implement wallet and payment API routes
    - `GET /api/wallet`: Return wallet details + balance (User, Merchant)
    - `POST /api/payments/send`: Send payment with PIN authorization (User)
    - `GET /api/payments/history`: Transaction history with pagination and filters (User, Merchant)
    - Wire JWT auth, role guard, rate limiter, and Zod validation middleware to each route
    - _Requirements: 2.5, 3.1–3.10, 8.1–8.7, 13.2_

  - [x] 11.2 Implement contact API routes
    - `GET /api/contacts`: List contacts (User)
    - `POST /api/contacts`: Create contact (User)
    - `PUT /api/contacts/[id]`: Update contact (User)
    - `DELETE /api/contacts/[id]`: Delete contact (User)
    - Wire JWT auth, role guard, and Zod validation
    - _Requirements: 6.1–6.6_

  - [x] 11.3 Implement QR code and user search API routes
    - `GET /api/qr/static`: Generate static QR (Merchant)
    - `POST /api/qr/dynamic`: Generate dynamic QR with amount and description (Merchant)
    - `POST /api/qr/parse`: Parse scanned QR data (User)
    - `GET /api/users/search`: Username autocomplete (User)
    - `POST /api/users/pin`: Set Transaction PIN (User)
    - `PUT /api/users/pin`: Reset Transaction PIN (User)
    - _Requirements: 7.1–7.6, 9.5, 4.1, 4.6_

  - [x] 11.4 Implement admin API routes
    - `GET /api/admin/dashboard`: Platform stats (Admin only)
    - `GET /api/admin/users`: Paginated user management list (Admin only)
    - `PUT /api/admin/users/[id]/status`: Activate/deactivate account (Admin only)
    - Wire role guard to enforce Admin-only access (403 for non-Admin)
    - _Requirements: 12.1–12.6_

  - [x] 11.5 Implement SSE endpoint
    - `GET /api/events/stream`: SSE endpoint for real-time payment notifications (User, Merchant)
    - Use `ReadableStream` in Next.js Route Handler for streaming response
    - Wire JWT auth to validate connection
    - _Requirements: 5.3_

- [x] 12. Checkpoint – Verify all API routes
  - Ensure all tests pass, ask the user if questions arise. All API endpoints should be functional with proper auth, validation, and error handling.

- [x] 13. User dashboard and send payment frontend
  - [x] 13.1 Implement `BottomNav` component (`src/components/BottomNav.tsx`)
    - User nav: Dashboard, Send, Contacts, History, Profile
    - Merchant nav: Dashboard, QR Codes, Transactions, Analytics, Profile
    - Mobile-first, Tailwind-styled, highlight active route
    - _Requirements: 10.3, 11.3_

  - [x] 13.2 Implement `BalanceCard` component (`src/components/BalanceCard.tsx`)
    - Display current XLM balance, refresh within last 30 seconds
    - _Requirements: 5.4, 10.1_

  - [x] 13.3 Implement `TransactionList` component (`src/components/TransactionList.tsx`)
    - Shared component for displaying transaction lists with sent/received indicators
    - _Requirements: 10.1, 11.1_

  - [x] 13.4 Implement User Dashboard page (`src/app/(dashboard)/user/page.tsx`)
    - Display XLM balance (BalanceCard), 5 most recent transactions, quick-pay buttons (Send, Scan QR, Pay by Username)
    - Responsive: 320px to 1440px without horizontal scrolling
    - SSE listener for real-time payment notifications
    - _Requirements: 10.1, 10.2, 10.4, 10.5_

  - [x] 13.5 Implement `UsernameAutocomplete` component (`src/components/UsernameAutocomplete.tsx`)
    - Search users by partial username, display up to 10 results
    - _Requirements: 9.5_

  - [x] 13.6 Implement Send Payment page (`src/app/(dashboard)/user/send/page.tsx`)
    - Payment form: recipient (username or Stellar address with autocomplete), amount, optional memo
    - PIN input modal for authorization before submission
    - Display success/error result with transaction ID
    - _Requirements: 3.1–3.10, 4.3, 4.8, 9.5, 10.4_

- [x] 14. QR scanner, contacts, and history frontend
  - [x] 14.1 Implement `QRCodeDisplay` component (`src/components/QRCodeDisplay.tsx`)
    - Render QR code using `qrcode.react` (SVG)
    - _Requirements: 7.1, 7.2_

  - [x] 14.2 Implement `QRScanner` component (`src/components/QRScanner.tsx`)
    - Camera-based QR scanning using `html5-qrcode`
    - Parse scanned data via `/api/qr/parse`, pre-populate payment form
    - Display error for malformed/invalid QR payloads
    - _Requirements: 7.4, 7.5, 7.6_

  - [x] 14.3 Implement QR Scan page (`src/app/(dashboard)/user/scan/page.tsx`)
    - Activate device camera, scan QR, navigate to send payment form with pre-populated data
    - _Requirements: 7.4, 10.5_

  - [x] 14.4 Implement Contacts page (`src/app/(dashboard)/user/contacts/page.tsx`)
    - List contacts alphabetically, add/edit/delete contacts, quick-pay from contact
    - _Requirements: 6.1–6.6_

  - [x] 14.5 Implement Transaction History page (`src/app/(dashboard)/user/history/page.tsx`)
    - Paginated transaction list (20/page), filters for date range, direction (sent/received), status (completed/failed)
    - Display all required transaction fields
    - _Requirements: 8.1–8.7_

  - [x] 14.6 Implement User Profile page (`src/app/(dashboard)/user/profile/page.tsx`)
    - Display user info, PIN management (set/reset Transaction PIN)
    - _Requirements: 4.1, 4.6, 4.7_

- [x] 15. Merchant dashboard and frontend
  - [x] 15.1 Implement Merchant Dashboard page (`src/app/(dashboard)/merchant/page.tsx`)
    - Display static QR code, total lifetime earnings, today's transaction count, 10 most recent inbound transactions
    - SSE listener for real-time payment notifications
    - _Requirements: 11.1_

  - [x] 15.2 Implement Merchant QR Management page (`src/app/(dashboard)/merchant/qr/page.tsx`)
    - Generate static QR, generate dynamic QR with amount and description fields
    - _Requirements: 7.1, 7.2, 11.2_

  - [x] 15.3 Implement Merchant Transactions page (`src/app/(dashboard)/merchant/transactions/page.tsx`)
    - Paginated transaction list with filters
    - _Requirements: 8.1–8.7_

  - [x] 15.4 Implement Merchant Analytics page (`src/app/(dashboard)/merchant/analytics/page.tsx`)
    - Daily transaction volume (XLM), transaction count per day, total earnings over last 30 days
    - Charts should render within 3 seconds for up to 10,000 transactions
    - _Requirements: 11.4, 11.5_

  - [x] 15.5 Implement Merchant Profile page (`src/app/(dashboard)/merchant/profile/page.tsx`)
    - Display merchant info, business name, description
    - _Requirements: 11.1_

- [x] 16. Admin dashboard frontend
  - [x] 16.1 Implement Admin Dashboard page (`src/app/(dashboard)/admin/page.tsx`)
    - Display total user count, merchant count, transaction count, total XLM volume, failed transactions in last 24h
    - _Requirements: 12.1_

  - [x] 16.2 Implement Admin User Management page (`src/app/(dashboard)/admin/users/page.tsx`)
    - Paginated list of users and merchants (25/page), search by username or email
    - Activate/deactivate accounts
    - _Requirements: 12.2, 12.3, 12.4, 12.5_

- [x] 17. Checkpoint – Verify full frontend and integration
  - Ensure all tests pass, ask the user if questions arise. All pages should render correctly, API integration should work end-to-end.

- [x] 18. Integration tests and final wiring
  - [x] 18.1 Write integration tests for auth flow
    - Registration → wallet creation → Friendbot funding → JWT issuance
    - Login with valid/invalid credentials, account lockout flow
    - _Requirements: 1.1–1.7, 2.1, 2.2_

  - [x] 18.2 Write integration tests for payment flow
    - Full send-payment: PIN verification → decrypt → sign → submit → record
    - Insufficient balance rejection, incorrect PIN rejection
    - _Requirements: 3.1–3.10, 4.3, 4.4_

  - [x] 18.3 Write integration tests for QR payment flow
    - QR scan → parse → pre-populate form → submit payment
    - _Requirements: 7.1–7.6_

  - [x] 18.4 Write integration tests for admin management
    - Deactivate account → login rejected, reactivate → login succeeds
    - Admin-only access enforcement
    - _Requirements: 12.4, 12.5, 12.6_

  - [x] 18.5 Write integration tests for SSE notifications
    - Inbound payment triggers SSE event to recipient's active session
    - _Requirements: 5.1, 5.3_

  - [x] 18.6 Add inline code comments for all non-trivial business logic, cryptographic operations, and Stellar SDK interactions
    - Review all service files and middleware for documentation completeness
    - _Requirements: 15.4_

- [x] 19. Final checkpoint – Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise. Full build succeeds, TypeScript strict mode clean, all property tests and integration tests green.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation after each major phase
- Property tests validate the 34 correctness properties defined in the design document
- Unit tests validate specific examples and edge cases
- All code is TypeScript with strict mode enabled throughout
