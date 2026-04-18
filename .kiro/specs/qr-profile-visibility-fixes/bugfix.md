# Bugfix Requirements Document

## Introduction

This document addresses four related UI and functionality bugs in the StellarPe application:

1. **QR scanning fails with "Invalid QR payload: data is not valid JSON"** — The `ProfileCard` component passes the raw Stellar address string directly to `QRCodeDisplay`, but the QR parser (`parseQRPayload`) expects a JSON object with an `address` field. When a user scans a profile QR code, the parser fails because the raw address string is not valid JSON.

2. **Profile page credentials not clearly visible** — The `ProfileCard` uses a `GlassCard` (glassmorphism) container with a semi-transparent background (`rgba(255, 255, 255, 0.12)`), and the username is rendered in `text-white` while the wallet ID uses `text-gray-300`. On the dashboard's `bg-gray-50` background, white and light gray text on a nearly transparent card has extremely poor contrast, making the username and wallet ID unreadable.

3. **Login page form visibility issues** — The login page labels use `text-gray-700` and input text is default (dark), which provides adequate contrast on the white Card background. However, the page heading uses `text-gray-900` and the subtitle uses `text-gray-500`, and the overall form may appear washed out. The email/username fields need improved visual prominence to ensure credentials are clearly visible.

4. **Transaction list missing smart contract deploy link** — The `TransactionList` component displays a truncated `stellarTxId` with a copy button, but does not provide a clickable link to view the transaction on a Stellar blockchain explorer (e.g., Stellar Expert). Users cannot easily verify or inspect their transactions on-chain.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user scans a QR code generated from the ProfileCard component THEN the system returns "Invalid QR payload: data is not valid JSON" because the QR code encodes the raw Stellar address string (e.g., `GABCD...`) instead of the expected JSON format (`{"address":"GABCD..."}`)

1.2 WHEN a user views the ProfileCard on the profile page THEN the username (`text-white`) and wallet ID (`text-gray-300`) are not clearly visible because the GlassCard has a nearly transparent background (`rgba(255, 255, 255, 0.12)`) rendered on the dashboard's light `bg-gray-50` background, resulting in white/light text on a light background with insufficient contrast

1.3 WHEN a user views the login page form THEN the email and password field labels and input text lack sufficient visual prominence, making the credentials not clearly distinguishable from the background

1.4 WHEN a user views the transaction list THEN the system displays a truncated transaction ID with only a copy button, but does not provide a clickable link to view the transaction on a Stellar blockchain explorer, preventing users from verifying transactions on-chain

### Expected Behavior (Correct)

2.1 WHEN a user scans a QR code generated from the ProfileCard component THEN the system SHALL successfully parse the QR payload and extract the Stellar address, because the QR code encodes the data as a JSON object (`{"address":"GABCD..."}`) matching the format expected by `parseQRPayload`

2.2 WHEN a user views the ProfileCard on the profile page THEN the username and wallet ID SHALL be clearly visible with sufficient contrast against the card background, meeting readable contrast standards regardless of the underlying page background color

2.3 WHEN a user views the login page form THEN the email and password field labels, input text, and form elements SHALL be clearly visible and distinguishable, with sufficient contrast and visual prominence for easy readability

2.4 WHEN a user views the transaction list and a transaction has a `stellarTxId` THEN the system SHALL display a clickable link to view the transaction on a Stellar blockchain explorer (e.g., Stellar Expert testnet), in addition to the existing copy button

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a merchant generates a static or dynamic QR code from the Merchant QR page THEN the system SHALL CONTINUE TO encode the QR payload as a JSON object and the QR code SHALL CONTINUE TO be scannable and parseable correctly

3.2 WHEN a user views the ProfileCard THEN the system SHALL CONTINUE TO display the avatar initial, username, wallet ID with copy button, QR code, and download button in the same layout structure

3.3 WHEN a user submits the login form with valid credentials THEN the system SHALL CONTINUE TO authenticate the user, store the JWT token, and redirect to the appropriate dashboard based on role

3.4 WHEN a user views the transaction list THEN the system SHALL CONTINUE TO display the direction badge (Sent/Received), status badge, counterparty address, timestamp, amount, and existing copy button for the transaction ID

3.5 WHEN a user views the profile page user details card (email, role, PIN status) THEN the system SHALL CONTINUE TO display these details with the existing Card component styling unchanged

3.6 WHEN a user scans a QR code generated from the Merchant QR page (both static and dynamic) THEN the system SHALL CONTINUE TO parse the payload successfully and navigate to the send payment form with pre-populated data
