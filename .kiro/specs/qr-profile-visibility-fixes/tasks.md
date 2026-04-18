# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - QR Encoding, Profile Contrast, and Explorer Link Bugs
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bugs exist
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fixes when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bugs exist
  - **Scoped PBT Approach**: Use `fast-check` to generate valid Stellar addresses (56 chars, starting with G, base32 A-Z2-7) and verify QR round-trip encoding
  - Bug 1 (QR Encoding): Import `parseQRPayload` from `src/lib/services/qr.service.ts`. For any valid Stellar address, the value that `ProfileCard` passes to `QRCodeDisplay` should be valid JSON parseable by `parseQRPayload`, and the extracted `address` field should equal the original address. On unfixed code, `ProfileCard` passes the raw address string, so `parseQRPayload` will throw "Invalid QR payload: data is not valid JSON"
  - Bug 2 (Profile Contrast): Render `ProfileCard` with test props and assert the username element has `text-gray-900` class (not `text-white`) and wallet ID has `text-gray-500` class (not `text-gray-300`). On unfixed code, these will be `text-white` and `text-gray-300`
  - Bug 3 (Login Visibility): Render the login page subtitle and assert it uses `text-gray-600` (not `text-gray-500`). On unfixed code, subtitle uses `text-gray-500`
  - Bug 4 (Explorer Link): Render `TransactionList` with a transaction that has a non-null `stellarTxId` and assert an anchor element exists with `href` matching `https://stellar.expert/explorer/testnet/tx/{stellarTxId}`, `target="_blank"`, and `rel="noopener noreferrer"`. On unfixed code, no such link exists
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct — it proves the bugs exist)
  - Document counterexamples found to understand root cause
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing Behavior Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs, then write property-based tests capturing observed behavior
  - Preservation A (ProfileCard Structure): Render `ProfileCard` and verify the avatar initial, username text, wallet ID with `CopyButton`, QR code via `QRCodeDisplay`, and `QRDownloadButton` all render in the correct order. Use `fast-check` to generate random usernames and wallet IDs
  - Preservation B (TransactionList Existing Elements): Render `TransactionList` with `fast-check`-generated transactions and verify direction badge (Sent/Received), status badge (Completed/Failed), counterparty address, timestamp, amount with XLM suffix, and copy button all continue to render. The explorer link addition must not remove or alter any existing elements
  - Preservation C (Login Auth Flow): Verify the login form still contains email input, password input, submit button, and registration link. Verify `handleSubmit` structure is unchanged — form submission, JWT storage, and role-based redirect logic must not be affected by styling changes
  - Preservation D (Merchant QR Compatibility): Verify that `generateStaticQR` and `generateDynamicQR` in `qr.service.ts` continue to produce valid JSON payloads parseable by `parseQRPayload`. Use `fast-check` to generate valid Stellar addresses and verify round-trip: `parseQRPayload(JSON.stringify({ address }))` returns the original address
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Fix QR encoding, profile visibility, login form, and explorer link

  - [x] 3.1 Fix ProfileCard QR encoding and visibility (`src/components/ProfileCard.tsx`)
    - Change `QRCodeDisplay` value from `stellarAddress` to `stellarAddress ? JSON.stringify({ address: stellarAddress }) : ''` to match the JSON format expected by `parseQRPayload`
    - Replace `GlassCard` import and usage with `Card` from `@/components/ui/Card` for opaque white background
    - Change username text color: `text-white` → `text-gray-900`
    - Change wallet ID text color: `text-gray-300` → `text-gray-500`
    - _Bug_Condition: isBugCondition(input) where input.context == 'qr_scan' AND qrPayload is raw Stellar address (not JSON), OR input.context == 'profile_view' AND cardComponent == 'GlassCard' with text-white/text-gray-300_
    - _Expected_Behavior: QR value is valid JSON with address field; text uses text-gray-900/text-gray-500 on opaque Card_
    - _Preservation: ProfileCard layout structure (avatar, username, wallet ID + copy, QR, download) unchanged per 3.2_
    - _Requirements: 2.1, 2.2, 3.2_

  - [x] 3.2 Fix login page form visibility (`src/app/(auth)/login/page.tsx`)
    - Enhance subtitle contrast: `text-gray-500` → `text-gray-600` on the "Sign in to your StellarPay account" paragraph
    - Add stronger visual prominence to form elements (e.g., subtle border or shadow on the form section)
    - Improve input field borders and focus states for better visibility
    - _Bug_Condition: isBugCondition(input) where input.context == 'login_view' AND subtitle uses text-gray-500_
    - _Expected_Behavior: Subtitle uses text-gray-600; form elements have enhanced visual prominence_
    - _Preservation: Login form submission logic, JWT storage, and role-based redirect unchanged per 3.3_
    - _Requirements: 2.3, 3.3_

  - [x] 3.3 Add transaction explorer link (`src/components/TransactionList.tsx`)
    - For each transaction with non-null `stellarTxId`, add a clickable anchor element linking to `https://stellar.expert/explorer/testnet/tx/{stellarTxId}`
    - Place the link alongside the existing `CopyButton` in the transaction ID row
    - Use `target="_blank"` and `rel="noopener noreferrer"` for security
    - Style as a small external link icon or "View" text link
    - Do NOT render the link when `stellarTxId` is null
    - _Bug_Condition: isBugCondition(input) where input.context == 'transaction_view' AND stellarTxId != null AND explorerLinkPresent == false_
    - _Expected_Behavior: Anchor element with href `https://stellar.expert/explorer/testnet/tx/{stellarTxId}` renders alongside copy button_
    - _Preservation: Direction badge, status badge, counterparty address, timestamp, amount, and copy button unchanged per 3.4_
    - _Requirements: 2.4, 3.4_

  - [x] 3.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - QR Encoding, Profile Contrast, and Explorer Link Fixes
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bugs are fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Existing Behavior Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)

- [x] 4. Checkpoint - Ensure all tests pass
  - Run the full test suite with `npx jest --run` to verify all tests pass
  - Ensure bug condition exploration tests pass (bugs are fixed)
  - Ensure preservation property tests pass (no regressions)
  - Ensure existing project tests still pass (no breakage)
  - Ask the user if questions arise
