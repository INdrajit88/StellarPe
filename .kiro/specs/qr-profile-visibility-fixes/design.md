# QR Profile Visibility Fixes — Bugfix Design

## Overview

This design addresses four related bugs in the StellarPe application:

1. **QR scanning failure**: `ProfileCard` encodes the raw Stellar address string into the QR code, but the QR parser (`parseQRPayload`) expects a JSON object `{"address":"..."}`. Scanning a profile QR code fails with "Invalid QR payload: data is not valid JSON".
2. **Profile page visibility**: `ProfileCard` uses a `GlassCard` with semi-transparent background (`rgba(255,255,255,0.12)`) and white/light-gray text, rendered on the dashboard's `bg-gray-50` background. The result is near-invisible text.
3. **Login page form visibility**: The login form heading, subtitle, and input fields lack sufficient visual prominence, making credentials hard to distinguish.
4. **Transaction list missing explorer link**: `TransactionList` shows a truncated `stellarTxId` with a copy button but no clickable link to view the transaction on a Stellar blockchain explorer.

The fix strategy is minimal and targeted: change the QR encoding format in `ProfileCard`, swap `GlassCard` for `Card` (or override text colors) on the profile page, enhance login form styling, and add a Stellar Expert link to each transaction row.

## Glossary

- **Bug_Condition (C)**: The set of conditions under which each bug manifests — QR encoding format mismatch, insufficient text contrast, missing explorer link
- **Property (P)**: The desired correct behavior — QR codes parse successfully, text is readable, explorer links are present
- **Preservation**: Existing behaviors that must remain unchanged — merchant QR generation, login authentication flow, transaction list layout, ProfileCard structure
- **parseQRPayload**: The function in `src/lib/services/qr.service.ts` that parses QR code data; expects a JSON string with an `address` field
- **ProfileCard**: The component in `src/components/ProfileCard.tsx` that displays user identity and QR code
- **GlassCard**: The glassmorphism card component in `src/components/ui/GlassCard.tsx` with semi-transparent background
- **Card**: The opaque white card component in `src/components/ui/Card.tsx` with `bg-white` background
- **TransactionList**: The component in `src/components/TransactionList.tsx` that renders transaction history
- **Stellar Expert**: The Stellar blockchain explorer at `stellar.expert` used to view transaction details on testnet

## Bug Details

### Bug Condition

The bugs manifest across four distinct conditions:

**Bug 1 — QR Encoding Mismatch**: When a user's profile QR code is scanned, the raw Stellar address string (e.g., `GABCD...`) is passed to `parseQRPayload`, which calls `JSON.parse()` on it. Since a raw address is not valid JSON, parsing fails immediately.

**Bug 2 — Profile Text Contrast**: When the `ProfileCard` renders inside the dashboard layout (`bg-gray-50`), the `GlassCard` background is `rgba(255,255,255,0.12)` — nearly transparent over the light page background. The `text-white` username and `text-gray-300` wallet ID become invisible (white-on-white).

**Bug 3 — Login Form Visibility**: When the login page renders, the form heading uses `text-gray-900` and subtitle uses `text-gray-500` on a white `Card`. While technically readable, the input fields with `border-gray-300` and `placeholder:text-gray-400` lack visual prominence, making the form feel washed out and credentials hard to distinguish.

**Bug 4 — Missing Explorer Link**: When a transaction has a `stellarTxId`, the `TransactionList` only shows a truncated ID and copy button. There is no clickable link to view the transaction on a Stellar blockchain explorer, preventing users from verifying transactions on-chain.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { context: 'qr_scan' | 'profile_view' | 'login_view' | 'transaction_view', data: any }
  OUTPUT: boolean

  IF input.context == 'qr_scan' THEN
    RETURN typeof input.data.qrPayload == 'string'
           AND NOT isValidJSON(input.data.qrPayload)
           AND isValidStellarAddress(input.data.qrPayload)
  END IF

  IF input.context == 'profile_view' THEN
    RETURN input.data.cardComponent == 'GlassCard'
           AND input.data.textColor IN ['text-white', 'text-gray-300']
           AND input.data.pageBackground == 'bg-gray-50'
  END IF

  IF input.context == 'login_view' THEN
    RETURN input.data.inputBorder == 'border-gray-300'
           AND input.data.headingStyle lacks visual prominence
  END IF

  IF input.context == 'transaction_view' THEN
    RETURN input.data.stellarTxId != null
           AND input.data.explorerLinkPresent == false
  END IF

  RETURN false
END FUNCTION
```

### Examples

- **QR Bug**: User profile QR encodes `GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV`. Scanner sends this to `/api/qr/parse`. `parseQRPayload` calls `JSON.parse("GABCDE...")` → throws "Invalid QR payload: data is not valid JSON". Expected: QR encodes `{"address":"GABCDE..."}` → parses successfully.
- **Profile Visibility**: User opens `/user/profile`. ProfileCard renders `<h2 class="text-white">alice</h2>` inside a GlassCard on `bg-gray-50`. White text on near-white background is unreadable. Expected: dark text on opaque white card background.
- **Login Visibility**: User opens `/login`. Input fields have thin `border-gray-300` borders and `placeholder:text-gray-400` placeholders. The form appears washed out. Expected: stronger borders and more prominent form elements.
- **Explorer Link**: User views transaction history. Transaction `TX: a1b2c3d4e5f6...` shows with copy button only. Expected: clickable link to `https://stellar.expert/explorer/testnet/tx/a1b2c3d4e5f6...` alongside the copy button.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Merchant static and dynamic QR code generation (`merchant/qr/page.tsx`) must continue to encode JSON payloads and be scannable
- `parseQRPayload` in `qr.service.ts` must continue to accept the same JSON format — no changes to the parser
- ProfileCard layout structure (avatar initial, username, wallet ID + copy button, QR code, download button) must remain the same
- Login form submission logic (`handleSubmit`), JWT storage, and role-based redirect must remain unchanged
- TransactionList existing elements (direction badge, status badge, counterparty address, timestamp, amount, copy button) must remain unchanged
- The `QRCodeDisplay` component API must remain unchanged — it accepts a `value` string prop
- The `Card` and `GlassCard` component implementations must remain unchanged

**Scope:**
All inputs that do NOT involve the four bug conditions should be completely unaffected by this fix. This includes:
- Merchant QR code generation and scanning flows
- All API endpoints (no backend changes required for bugs 2, 3, 4)
- Dashboard layout and navigation
- PIN management on the profile page
- Registration page styling
- All other component styling outside the four affected components

## Hypothesized Root Cause

Based on the bug analysis and code review, the root causes are:

1. **QR Encoding Format Mismatch (ProfileCard.tsx, line 65)**:
   - `ProfileCard` passes `stellarAddress` directly to `QRCodeDisplay`: `<QRCodeDisplay value={stellarAddress} size={200} />`
   - The merchant QR page correctly wraps it: `JSON.stringify({ address: stellarAddress })`
   - The `generateStaticQR` function in `qr.service.ts` also wraps it in JSON
   - The `ProfileCard` was likely written before the QR parsing convention was established, or the developer assumed the QR code would only be used for display/copy, not scanning

2. **Profile Card Contrast Failure (ProfileCard.tsx + GlassCard.tsx + globals.css)**:
   - `GlassCard` uses `--glass-bg: rgba(255, 255, 255, 0.12)` — designed for dark backgrounds
   - The dashboard layout uses `bg-gray-50` (light background)
   - `ProfileCard` uses `text-white` and `text-gray-300` — designed for dark backgrounds
   - The glassmorphism design system was intended for a dark-themed dashboard but the dashboard uses a light theme

3. **Login Form Washed-Out Appearance (login/page.tsx + Input.tsx)**:
   - The `Input` component uses `border-gray-300` which is subtle on white
   - The page subtitle uses `text-gray-500` which is low-contrast
   - The overall form lacks visual hierarchy cues (no section borders, no background differentiation)

4. **Missing Explorer Link (TransactionList.tsx)**:
   - The component was built with only a copy button for the `stellarTxId`
   - No anchor element was added to link to a Stellar explorer
   - This appears to be a missing feature rather than a regression — the explorer link was never implemented

## Correctness Properties

Property 1: Bug Condition - QR Round-Trip Encoding

_For any_ valid Stellar address encoded by `ProfileCard` into a QR code, the resulting QR payload string SHALL be valid JSON parseable by `parseQRPayload`, and the extracted `address` field SHALL equal the original Stellar address.

**Validates: Requirements 2.1**

Property 2: Bug Condition - Profile Card Text Contrast

_For any_ rendering of `ProfileCard` on the dashboard profile page, the username and wallet ID text SHALL use color classes that provide sufficient contrast against the card's opaque background (e.g., `text-gray-900` on `bg-white`), ensuring readability on the `bg-gray-50` dashboard background.

**Validates: Requirements 2.2**

Property 3: Bug Condition - Login Form Visual Prominence

_For any_ rendering of the login page, the form heading, input labels, and input fields SHALL use styling that provides clear visual prominence and sufficient contrast, including stronger input borders and readable placeholder text.

**Validates: Requirements 2.3**

Property 4: Bug Condition - Transaction Explorer Link

_For any_ transaction in the `TransactionList` where `stellarTxId` is non-null, the component SHALL render a clickable anchor element linking to the Stellar Expert testnet explorer URL for that transaction (`https://stellar.expert/explorer/testnet/tx/{stellarTxId}`), in addition to the existing copy button.

**Validates: Requirements 2.4**

Property 5: Preservation - Merchant QR Compatibility

_For any_ QR code generated by the merchant QR page (both static and dynamic), the QR payload SHALL continue to be valid JSON parseable by `parseQRPayload`, and the fix to `ProfileCard` SHALL NOT affect the merchant QR generation code path.

**Validates: Requirements 3.1, 3.6**

Property 6: Preservation - Transaction List Existing Elements

_For any_ transaction rendered by `TransactionList`, the component SHALL continue to display the direction badge (Sent/Received), status badge (Completed/Failed), counterparty address, timestamp, amount, and copy button exactly as before the fix.

**Validates: Requirements 3.4**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/components/ProfileCard.tsx`

**Function**: `ProfileCard`

**Specific Changes**:
1. **QR Encoding Fix**: Change the `QRCodeDisplay` value from raw `stellarAddress` to `JSON.stringify({ address: stellarAddress })` to match the format expected by `parseQRPayload`. This mirrors what the merchant QR page already does.
   - Before: `<QRCodeDisplay value={stellarAddress} size={200} />`
   - After: `<QRCodeDisplay value={stellarAddress ? JSON.stringify({ address: stellarAddress }) : ''} size={200} />`

2. **Card Component Swap**: Replace `GlassCard` with the opaque `Card` component to provide a white background for text readability on the light dashboard.
   - Before: `import { GlassCard } from '@/components/ui/GlassCard';` and `<GlassCard className="p-6">`
   - After: `import { Card } from '@/components/ui/Card';` and `<Card className="p-6">`

3. **Text Color Fix**: Change text colors from white/light-gray to dark colors appropriate for a white card background.
   - Username: `text-white` → `text-gray-900`
   - Wallet ID: `text-gray-300` → `text-gray-500`

---

**File**: `src/app/(auth)/login/page.tsx`

**Function**: `LoginPage`

**Specific Changes**:
4. **Form Visual Enhancement**: Improve the visual prominence of the login form:
   - Add a stronger heading style or accent color to the page title
   - Enhance the subtitle contrast: `text-gray-500` → `text-gray-600`
   - Add a subtle background or border to the form section for visual grouping
   - Consider adding focus ring visibility improvements to inputs

---

**File**: `src/components/TransactionList.tsx`

**Function**: `TransactionList`

**Specific Changes**:
5. **Add Explorer Link**: For each transaction with a non-null `stellarTxId`, add a clickable link to Stellar Expert testnet:
   - URL format: `https://stellar.expert/explorer/testnet/tx/{stellarTxId}`
   - Render as an anchor element with `target="_blank"` and `rel="noopener noreferrer"`
   - Place alongside the existing copy button in the transaction ID row
   - Style as a small icon or text link (e.g., "View" or external link icon)

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bugs on unfixed code, then verify the fixes work correctly and preserve existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bugs BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that verify the QR encoding format, rendered CSS classes, and presence/absence of explorer links. Run these tests on the UNFIXED code to observe failures and understand the root cause.

**Test Cases**:
1. **QR Encoding Test**: Render `ProfileCard` with a valid Stellar address, extract the `value` prop passed to `QRCodeDisplay`, and attempt to parse it with `parseQRPayload` (will fail on unfixed code — raw address is not JSON)
2. **Profile Contrast Test**: Render `ProfileCard` and check that text elements use dark color classes suitable for a light background (will fail on unfixed code — finds `text-white`)
3. **Login Prominence Test**: Render the login page and verify form elements have enhanced visual styling (will fail on unfixed code — finds `text-gray-500` subtitle)
4. **Explorer Link Test**: Render `TransactionList` with a transaction that has a `stellarTxId` and check for an anchor element linking to Stellar Expert (will fail on unfixed code — no link exists)

**Expected Counterexamples**:
- QR: `parseQRPayload("GABCDE...")` throws "Invalid QR payload: data is not valid JSON"
- Profile: `ProfileCard` renders `text-white` class on username element
- Transaction: No `<a>` element with `stellar.expert` href found in transaction row
- Possible causes: format mismatch in ProfileCard, wrong design system assumption for GlassCard, missing feature in TransactionList

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  IF input.context == 'qr_scan' THEN
    qrValue := ProfileCard_fixed.getQRValue(input.stellarAddress)
    parsed := parseQRPayload(qrValue)
    ASSERT parsed.address == input.stellarAddress
  END IF

  IF input.context == 'profile_view' THEN
    rendered := render(ProfileCard_fixed(input.props))
    ASSERT rendered.username.className CONTAINS 'text-gray-900'
    ASSERT rendered.walletId.className CONTAINS 'text-gray-500'
    ASSERT rendered.card.className CONTAINS 'bg-white'
  END IF

  IF input.context == 'transaction_view' AND input.stellarTxId != null THEN
    rendered := render(TransactionList_fixed(input.transactions))
    link := rendered.querySelector('a[href*="stellar.expert"]')
    ASSERT link != null
    ASSERT link.href == 'https://stellar.expert/explorer/testnet/tx/' + input.stellarTxId
  END IF
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT ProfileCard_original.layout == ProfileCard_fixed.layout
  ASSERT TransactionList_original.existingElements == TransactionList_fixed.existingElements
  ASSERT LoginPage_original.handleSubmit == LoginPage_fixed.handleSubmit
  ASSERT MerchantQR_original.encoding == MerchantQR_fixed.encoding
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for merchant QR generation, transaction list rendering, and login form submission, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Merchant QR Preservation**: Verify that merchant static QR codes continue to encode `JSON.stringify({ address })` and dynamic QR codes continue to encode `JSON.stringify({ address, amount, description })` — no changes to merchant code path
2. **Transaction List Element Preservation**: For any transaction, verify that direction badge, status badge, counterparty address, timestamp, amount, and copy button continue to render correctly after adding the explorer link
3. **Login Auth Flow Preservation**: Verify that form submission, JWT storage, and role-based redirect continue to work identically after styling changes
4. **ProfileCard Structure Preservation**: Verify that avatar initial, username, wallet ID with copy button, QR code, and download button all continue to render in the same order

### Unit Tests

- Test that `ProfileCard` QR value is valid JSON with an `address` field matching the input
- Test that `ProfileCard` renders with dark text colors on an opaque card
- Test that `TransactionList` renders an explorer link for transactions with `stellarTxId`
- Test that `TransactionList` does NOT render an explorer link for transactions without `stellarTxId`
- Test that login page renders with enhanced form styling
- Test edge case: `ProfileCard` with empty `stellarAddress` renders empty QR placeholder

### Property-Based Tests

- Generate random valid Stellar addresses (56 chars, starting with G, base32) and verify QR round-trip: `parseQRPayload(JSON.stringify({ address }))` returns the original address
- Generate random transaction lists with varying `stellarTxId` presence and verify explorer links appear only when `stellarTxId` is non-null, and all existing elements are preserved
- Generate random transaction data and verify the explorer URL format is always `https://stellar.expert/explorer/testnet/tx/{stellarTxId}`

### Integration Tests

- Test full QR scan flow: render ProfileCard → extract QR value → call `/api/qr/parse` → verify successful parse with correct address
- Test profile page rendering: mount the full profile page and verify ProfileCard text is readable (dark text on white background)
- Test transaction list with explorer link: click the explorer link and verify it opens the correct Stellar Expert URL
- Test login page end-to-end: verify form is visually prominent and submission still works correctly
