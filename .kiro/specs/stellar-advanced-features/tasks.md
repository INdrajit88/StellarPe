# Implementation Plan: Stellar Advanced Features

## Overview

This plan implements five capability areas for StellarPe: CI/CD pipeline automation (GitHub Actions), Soroban smart contract services (deploy, invoke, inter-contract calls), SEP-41 token creation, liquidity pool mechanics (deposit, withdraw, swap), and dashboard UI for token/LP display. Requirements 11 (event streaming) and 12 (mobile responsive) are already implemented — tasks for those only verify existing behavior.

The implementation uses TypeScript throughout, with Next.js 16 App Router, Prisma 7, `@stellar/stellar-sdk` v15, Tailwind CSS v4, and Jest + fast-check for testing.

## Tasks

- [x] 1. Set up CI/CD pipeline
  - [x] 1.1 Create GitHub Actions workflow file at `.github/workflows/ci.yml`
    - Define workflow triggers: `pull_request` targeting `main` and `push` to `main`
    - Configure `ubuntu-latest` runner with PostgreSQL 16 service container and health checks
    - Set up `actions/checkout@v4`, `actions/setup-node@v4` (Node 22)
    - Cache `node_modules` using `actions/cache@v4` with key `node-modules-${{ hashFiles('package-lock.json') }}`
    - Add `npm ci` step (skip if cache hit)
    - Add `npm run lint` step (ESLint)
    - Add `npx prisma generate` step
    - Add `npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-migrations prisma/migrations --exit-code` step for migration drift detection
    - Add `npm test -- --run` step (Jest single execution) with env vars from GitHub Secrets (`DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_MASTER_KEY`, `HORIZON_URL`, `STELLAR_NETWORK_PASSPHRASE`)
    - Add `npm run build` step
    - Add conditional Vercel deploy step: `npx vercel deploy --prod --token=${{ secrets.VERCEL_TOKEN }}` only on push to `main`
    - Configure `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` as environment variables from secrets
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4_

- [x] 2. Checkpoint — Verify CI/CD workflow syntax
  - Ensure the workflow YAML is valid and all steps are correctly ordered. Ask the user if questions arise.

- [x] 3. Update database schema with new Prisma models
  - [x] 3.1 Add `Contract`, `Token`, `LPPosition`, and `SwapTransaction` models to `prisma/schema.prisma`
    - `Contract` model: `id`, `contractId` (unique Soroban C... address), `contractType` (TOKEN/POOL/CUSTOM), `wasmHash`, `deployerAddress`, `deployerId`, `deployTxHash`, `metadata` (Json?), `createdAt`, relation to `User`
    - `Token` model: `id`, `contractId` (unique), `name`, `symbol`, `decimals` (Int), `deployerId`, `createdAt`, relation to `User`
    - `LPPosition` model: `id`, `poolContractId`, `merchantId`, `shares` (Decimal(38,0)), `tokenAContractId`, `tokenBContractId`, `createdAt`, `updatedAt`, relation to `User`, unique constraint on `[poolContractId, merchantId]`
    - `SwapTransaction` model: `id`, `poolContractId`, `userId`, `inputToken`, `outputToken`, `inputAmount` (Decimal(38,18)), `outputAmount` (Decimal(38,18)), `feeAmount` (Decimal(38,18)), `stellarTxHash` (unique, optional), `createdAt`, relation to `User`
    - Add `contracts`, `tokens`, `lpPositions`, `swapTransactions` relations to the existing `User` model
    - Add appropriate indexes as specified in the design document
    - _Requirements: 4.5, 7.3, 8.7, 9.6_

  - [x] 3.2 Generate Prisma client and create migration
    - Run `npx prisma generate` to regenerate the client with new models
    - Run `npx prisma migrate dev --name add-contract-token-pool-models` to create the migration file
    - _Requirements: 4.5, 7.3, 8.7, 9.6_

- [x] 4. Implement Contract Service
  - [x] 4.1 Create `src/lib/services/contract.service.ts` with Soroban RPC helpers
    - Add helper functions `getSorobanRpcUrl()` and `getSorobanServer()` reading `SOROBAN_RPC_URL` from `process.env` at call time (matching `stellar.service.ts` pattern)
    - Implement `deployContract(wasmBuffer: Buffer, deployerSecret: string)` using `@stellar/stellar-sdk` v15 — upload WASM, instantiate contract, return `{ contractId, transactionHash }`
    - Implement `invokeContract(contractId, functionName, args: xdr.ScVal[], callerSecret, subAuth?)` — build Soroban transaction, sign, submit, return `{ transactionHash, returnValue }`
    - Implement `simulateContract(contractId, functionName, args: xdr.ScVal[])` — read-only call via `simulateTransaction`, return `{ returnValue }`
    - Use `nativeToScVal` and `scValToNative` for XDR serialization/deserialization
    - Handle inter-contract calls via `subAuth` parameter for sub-contract authorization entries
    - Include descriptive error handling: deployment rejection reasons, invocation error codes, missing sub-contract authorization identification
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4_

  - [x] 4.2 Write unit tests for Contract Service
    - Test `deployContract` with mocked Soroban RPC responses (success and failure)
    - Test `invokeContract` with mocked transaction submission (success, on-chain error, auth failure)
    - Test `simulateContract` for read-only calls
    - Test inter-contract authorization construction
    - Test XDR serialization/deserialization round-trips
    - Test error handling for network rejection, missing authorization
    - _Requirements: 4.1, 4.2, 4.4, 5.1, 5.4, 6.4_

- [x] 5. Implement Contract API routes
  - [x] 5.1 Create contract validators at `src/lib/validators/contract.validator.ts`
    - `deployContractSchema`: validate `wasmBase64` (non-empty string), optional `constructorArgs`
    - `invokeContractSchema`: validate `contractId` (string), `functionName` (string), `args` (array), optional `subAuth` array
    - `simulateContractSchema`: validate `contractId`, `functionName`, `args`
    - _Requirements: 5.5, 6.5_

  - [x] 5.2 Create `POST /api/contracts/deploy` route at `src/app/api/contracts/deploy/route.ts`
    - Apply JWT auth via `x-user-id` / `x-user-role` headers from Edge middleware
    - Apply `requireRole('MERCHANT')` guard
    - Validate request body with `deployContractSchema`
    - Call `ContractService.deployContract()`, store result in `Contract` table via Prisma
    - Return `{ contractId, transactionHash }` on success, appropriate error responses on failure
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 5.3 Create `POST /api/contracts/invoke` route at `src/app/api/contracts/invoke/route.ts`
    - Apply JWT auth, `requireRole('USER', 'MERCHANT')` guard
    - Validate request body with `invokeContractSchema`
    - Call `ContractService.invokeContract()` with optional `subAuth` for inter-contract calls
    - Return `{ transactionHash, returnValue }` on success
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 5.4 Create `POST /api/contracts/simulate` route at `src/app/api/contracts/simulate/route.ts`
    - Apply JWT auth, `requireRole('USER', 'MERCHANT')` guard
    - Validate request body with `simulateContractSchema`
    - Call `ContractService.simulateContract()`
    - Return `{ returnValue }` on success
    - _Requirements: 5.3_

  - [x] 5.5 Write unit tests for contract API routes
    - Test deploy route: success, validation errors, role guard (non-MERCHANT rejected), deployment failure
    - Test invoke route: success, inter-contract call with subAuth, validation errors, role guard
    - Test simulate route: success, validation errors
    - _Requirements: 4.1, 4.4, 5.1, 5.4, 6.4, 6.5_

- [x] 6. Checkpoint — Verify contract service and routes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement Token Service
  - [x] 7.1 Create `src/lib/services/token.service.ts`
    - Implement `createToken({ name, symbol, decimals, initialSupply, merchantId })` — deploy SEP-41 WASM via `ContractService.deployContract()`, invoke `initialize(admin, decimals, name, symbol)` and `mint(to, amount)`, store token metadata in `Token` table, return `{ contractId, transactionHash }`
    - Decrypt merchant's secret key via `EncryptionService` for signing
    - Validate decimals (0–18 range) at service level
    - Implement `getTokenBalance(contractId, address)` — call `simulateContract` with `balance(address)`, return balance string
    - Implement `getUserTokenBalances(userId)` — query `Token` table for user's tokens, batch-query balances via Soroban RPC, return array of `{ contractId, name, symbol, decimals, balance }`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 7.2 Write unit tests for Token Service
    - Test `createToken` with mocked contract deployment and invocation
    - Test `getTokenBalance` with mocked simulation response
    - Test `getUserTokenBalances` with mocked Prisma queries and RPC calls
    - Test decimal validation (reject <0 or >18)
    - _Requirements: 7.1, 7.2, 7.4, 7.5_

- [x] 8. Implement Token API routes
  - [x] 8.1 Create token validators at `src/lib/validators/token.validator.ts`
    - `createTokenSchema`: validate `name` (1–32 chars), `symbol` (1–12 chars), `decimals` (integer 0–18), `initialSupply` (positive string)
    - _Requirements: 7.5, 7.6_

  - [x] 8.2 Create `POST /api/tokens/create` route at `src/app/api/tokens/create/route.ts`
    - Apply JWT auth, `requireRole('MERCHANT')` guard
    - Validate request body with `createTokenSchema`
    - Call `TokenService.createToken()` with merchant's user ID
    - Return `{ contractId, transactionHash }` on success
    - _Requirements: 7.1, 7.2, 7.3, 7.5, 7.6_

  - [x] 8.3 Create `GET /api/tokens/balances` route at `src/app/api/tokens/balances/route.ts`
    - Apply JWT auth, `requireRole('USER', 'MERCHANT')` guard
    - Call `TokenService.getUserTokenBalances()` with authenticated user ID
    - Return array of token balances
    - _Requirements: 7.4, 7.7_

  - [x] 8.4 Write unit tests for token API routes
    - Test create route: success, validation errors (bad decimals, empty name), role guard
    - Test balances route: success with tokens, empty result, role guard
    - _Requirements: 7.5, 7.6, 7.7_

- [x] 9. Implement Pool Service
  - [x] 9.1 Create `src/lib/services/pool.service.ts`
    - Implement `deployPool({ tokenAContractId, tokenBContractId, deployerSecret })` — deploy liquidity pool WASM via `ContractService.deployContract()`, return `{ poolContractId, transactionHash }`
    - Implement `deposit({ poolContractId, amountA, amountB, merchantId, pin })` — verify PIN via `PINService.verifyPin`, decrypt secret key via `EncryptionService`, invoke pool contract `deposit(depositor, amount_a, amount_b, min_shares)` with inter-contract token authorizations in `subAuth`, store/update `LPPosition` in database, return `{ shares, transactionHash }`
    - Implement `withdraw({ poolContractId, shares, merchantId, pin })` — verify PIN, decrypt key, invoke pool contract `withdraw(withdrawer, shares, min_a, min_b)`, update `LPPosition` in database, return `{ amountA, amountB, transactionHash }`
    - Implement `swap({ poolContractId, inputToken, inputAmount, minOutputAmount, userId, pin })` — verify PIN, decrypt key, simulate swap first to check output against `minOutputAmount` (reject with slippage error if below), then submit transaction, record `SwapTransaction` in database, return `{ outputAmount, effectiveRate, feeAmount, transactionHash }`
    - Handle inter-contract calls (pool contract calling token contracts for `transfer`) via `subAuth` parameter
    - Include descriptive error handling for on-chain failures with Soroban diagnostic messages
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 9.2 Write unit tests for Pool Service
    - Test `deposit` with mocked contract invocation and PIN verification
    - Test `withdraw` with mocked contract invocation
    - Test `swap` with mocked simulation (slippage check) and submission
    - Test slippage rejection when output < minOutputAmount
    - Test error handling for on-chain failures
    - _Requirements: 8.2, 8.3, 8.5, 9.1, 9.4_

- [x] 10. Implement Pool API routes
  - [x] 10.1 Create pool validators at `src/lib/validators/pool.validator.ts`
    - `depositSchema`: validate `poolContractId` (string), `amountA` (positive string), `amountB` (positive string), `pin` (4–6 digit string)
    - `withdrawSchema`: validate `poolContractId` (string), `shares` (positive string), `pin` (4–6 digit string)
    - `swapSchema`: validate `poolContractId` (string), `inputToken` (string), `inputAmount` (positive string), `minOutputAmount` (positive string), `pin` (4–6 digit string)
    - _Requirements: 8.6, 9.5_

  - [x] 10.2 Create `POST /api/pools/deposit` route at `src/app/api/pools/deposit/route.ts`
    - Apply JWT auth, `requireRole('MERCHANT')` guard, rate limiting
    - Validate request body with `depositSchema`
    - Call `PoolService.deposit()` with merchant's user ID
    - Return `{ shares, transactionHash }` on success
    - _Requirements: 8.2, 8.5, 8.6_

  - [x] 10.3 Create `POST /api/pools/withdraw` route at `src/app/api/pools/withdraw/route.ts`
    - Apply JWT auth, `requireRole('MERCHANT')` guard, rate limiting
    - Validate request body with `withdrawSchema`
    - Call `PoolService.withdraw()` with merchant's user ID
    - Return `{ amountA, amountB, transactionHash }` on success
    - _Requirements: 8.3, 8.5, 8.6_

  - [x] 10.4 Create `POST /api/pools/swap` route at `src/app/api/pools/swap/route.ts`
    - Apply JWT auth, `requireRole('USER', 'MERCHANT')` guard, rate limiting
    - Validate request body with `swapSchema`
    - Call `PoolService.swap()` with authenticated user ID
    - Return `{ outputAmount, effectiveRate, feeAmount, transactionHash }` on success
    - Return slippage error (400) when output < minOutputAmount
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x] 10.5 Create `GET /api/pools/positions` route at `src/app/api/pools/positions/route.ts`
    - Apply JWT auth, `requireRole('MERCHANT')` guard
    - Query `LPPosition` table for the authenticated merchant's positions
    - Return array of LP positions with pool contract ID, share amounts, token contract IDs
    - _Requirements: 8.7, 10.2_

  - [x] 10.6 Write unit tests for pool API routes
    - Test deposit route: success, validation errors, role guard, on-chain failure
    - Test withdraw route: success, validation errors, role guard
    - Test swap route: success, slippage rejection, validation errors, role guard
    - Test positions route: success with positions, empty result, role guard
    - _Requirements: 8.5, 8.6, 9.4, 9.5_

- [x] 11. Checkpoint — Verify all services and API routes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Implement Dashboard UI components
  - [x] 12.1 Create `TokenBalanceList` component at `src/components/TokenBalanceList.tsx`
    - Accept `balances` prop: array of `{ contractId, name, symbol, decimals, balance }`
    - Render each token with name, symbol, and formatted balance (respecting decimals)
    - Show empty state message "No custom tokens held" when array is empty
    - Use existing `Card` component for consistent styling
    - Follow existing Tailwind CSS patterns (mobile-first, responsive)
    - _Requirements: 10.1, 10.3, 10.5_

  - [x] 12.2 Create `LPPositionList` component at `src/components/LPPositionList.tsx`
    - Accept `positions` prop: array of LP position data with pool name, deposited amounts, share value, earned fees
    - Render each position with pool identifier, share amount, and token pair info
    - Show empty state message "No liquidity pool positions" when array is empty
    - Use existing `Card` component for consistent styling
    - _Requirements: 10.2_

  - [x] 12.3 Integrate `TokenBalanceList` into Merchant Dashboard at `src/app/(dashboard)/merchant/page.tsx`
    - Add a "Custom Tokens" section below the existing stats cards
    - Fetch token balances from `GET /api/tokens/balances` on mount with 60-second staleness window
    - Add `LPPositionList` section below the token balances
    - Fetch LP positions from `GET /api/pools/positions` on mount with 60-second staleness window
    - Handle loading states with skeleton placeholders matching existing patterns
    - _Requirements: 10.1, 10.2, 10.4_

  - [x] 12.4 Integrate `TokenBalanceList` into User Dashboard at `src/app/(dashboard)/user/page.tsx`
    - Add a "Custom Tokens" section below the balance card
    - Fetch token balances from `GET /api/tokens/balances` on mount with 60-second staleness window
    - Handle loading states with skeleton placeholders matching existing patterns
    - _Requirements: 10.3, 10.4, 10.5_

  - [x] 12.5 Write unit tests for Dashboard UI components
    - Test `TokenBalanceList` renders token names, symbols, and balances correctly
    - Test `TokenBalanceList` renders empty state when no tokens
    - Test `LPPositionList` renders positions correctly
    - Test `LPPositionList` renders empty state when no positions
    - _Requirements: 10.1, 10.2, 10.3, 10.5_

- [x] 13. Checkpoint — Verify dashboard UI integration
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Verify existing implementations (Requirements 11 and 12)
  - [x] 14.1 Verify Requirement 11 — Advanced Event Streaming
    - Confirm `src/app/api/events/stream/route.ts` exists and implements SSE endpoint with `text/event-stream` response
    - Confirm `src/lib/services/notification.service.ts` implements `subscribe`, `unsubscribe`, `notifyPaymentReceived`, `startHorizonStreaming`, and `calculateBackoff`
    - Confirm exponential backoff formula: `min(2^attempt × baseInterval, maxInterval)` with base 1s, max 30s
    - Confirm one-connection-per-user logic (existing connection closed before new one registered)
    - Confirm SSE events include `connected` and `payment_received` event types
    - Add a brief comment in the SSE route referencing Requirements 11.1–11.6 for traceability
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_

  - [x] 14.2 Verify Requirement 12 — Mobile Responsive Design
    - Confirm `src/components/BottomNav.tsx` exists with role-specific navigation items (USER: Dashboard, Send, Contacts, History, Profile; MERCHANT: Dashboard, QR Codes, Transactions, Analytics, Profile)
    - Confirm `BottomNav` is fixed to bottom of viewport with `fixed bottom-0` classes
    - Confirm active route highlighting uses indigo-600 color with exact-match for root routes and prefix-match for nested routes
    - Confirm dashboard pages use mobile-first Tailwind CSS responsive utilities
    - Add a brief comment in `BottomNav.tsx` referencing Requirements 12.1–12.7 for traceability
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

- [x] 15. Final checkpoint — Full verification
  - Ensure all tests pass and all 12 requirements are covered by implementation or verification tasks. Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Requirements 11 and 12 are already implemented — tasks 14.1 and 14.2 only verify and document existing code
- The Rust smart contract WASM binaries are out of scope — services interact with pre-compiled binaries
- All new services follow the existing pattern: env config read at call time, not module level
- All new API routes follow the existing pattern: Edge middleware JWT → role guard → validation → service call
