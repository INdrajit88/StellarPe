# Requirements Document

## Introduction

This document specifies advanced features for the StellarPe payment application, covering five capability areas: CI/CD pipeline automation, Soroban smart contract integration (inter-contract calls), custom token creation with liquidity pool mechanics, advanced event streaming, and mobile responsive design. The first three areas represent new functionality to be built. The last two areas — event streaming and mobile responsive design — already exist in the codebase and are documented here for completeness and submission purposes.

The application is built with Next.js 16 (App Router), Prisma 7 with PostgreSQL, @stellar/stellar-sdk v15, Tailwind CSS v4, Jest for testing, and is deployed to Vercel.

---

## Glossary

- **System**: The StellarPe web application as a whole.
- **CI_CD_Pipeline**: The GitHub Actions workflow that automates linting, testing, building, and deploying the application on every pull request and push to the main branch.
- **GitHub_Actions**: The CI/CD platform used to run automated workflows defined in YAML configuration files within the `.github/workflows/` directory.
- **Vercel**: The hosting platform where the production application is deployed.
- **Soroban**: The smart contract platform on the Stellar blockchain, enabling deployment and execution of WebAssembly-based smart contracts.
- **Soroban_Contract**: A WebAssembly smart contract deployed to the Stellar testnet via the Soroban runtime.
- **Soroban_RPC**: The JSON-RPC server used to interact with Soroban smart contracts on the Stellar testnet.
- **Contract_Service**: The backend service responsible for deploying, invoking, and managing Soroban smart contracts.
- **Inter_Contract_Call**: An invocation from one Soroban_Contract to another Soroban_Contract within a single transaction on the Stellar network.
- **Token_Contract**: A Soroban_Contract that implements the Stellar SEP-41 token interface, enabling creation and management of custom fungible tokens.
- **Liquidity_Pool**: A Soroban_Contract that holds reserves of two tokens and enables automated deposit, withdrawal, and swap operations using a constant-product formula.
- **LP_Position**: A record of a merchant's deposited token amounts and corresponding share of a Liquidity_Pool.
- **Token_Service**: The backend service responsible for deploying Token_Contracts and querying token balances.
- **Pool_Service**: The backend service responsible for interacting with Liquidity_Pool contracts for deposit, withdrawal, and swap operations.
- **SSE_Endpoint**: The Server-Sent Events endpoint at `/api/events/stream` that pushes real-time payment notifications to connected browser clients.
- **Notification_Service**: The backend service that manages SSE connections and relays Horizon payment events to connected users.
- **Horizon_API**: The Stellar testnet Horizon server used to stream payment events and query account state.
- **Bottom_Nav**: The mobile bottom navigation bar present on all authenticated User and Merchant screens.
- **Dashboard**: The role-specific main screen presented to a User, Merchant, or Admin after authentication.
- **Prisma**: The ORM layer used to interact with the PostgreSQL database.
- **Prisma_Migration**: A versioned database schema change managed by Prisma Migrate.

---

## Requirements

### Requirement 1: CI/CD Pipeline — Automated Lint, Test, and Build

**User Story:** As a developer, I want an automated CI/CD pipeline that runs lint, tests, and build checks on every pull request and push to main, so that code quality is enforced before merging and deployment.

#### Acceptance Criteria

1. WHEN a pull request is opened or updated targeting the main branch, THE CI_CD_Pipeline SHALL execute the lint step using the project ESLint configuration.
2. WHEN a pull request is opened or updated targeting the main branch, THE CI_CD_Pipeline SHALL execute the full test suite using Jest with the `--run` flag (single execution, not watch mode).
3. WHEN a pull request is opened or updated targeting the main branch, THE CI_CD_Pipeline SHALL execute the production build step (`prisma generate && next build`).
4. WHEN a push is made directly to the main branch, THE CI_CD_Pipeline SHALL execute the lint, test, and build steps in sequence.
5. IF any lint, test, or build step fails, THEN THE CI_CD_Pipeline SHALL mark the workflow run as failed and report the failure status on the pull request.
6. THE CI_CD_Pipeline SHALL use a PostgreSQL service container to provide a test database for the test step.
7. THE CI_CD_Pipeline SHALL cache `node_modules` based on the `package-lock.json` hash to reduce installation time on subsequent runs.

---

### Requirement 2: CI/CD Pipeline — Prisma Migration Checks

**User Story:** As a developer, I want the CI/CD pipeline to verify that Prisma migrations are consistent with the schema, so that database drift is caught before deployment.

#### Acceptance Criteria

1. WHEN the CI_CD_Pipeline executes on a pull request or push to main, THE CI_CD_Pipeline SHALL run `prisma generate` to verify that the Prisma client can be generated from the current schema without errors.
2. WHEN the CI_CD_Pipeline executes on a pull request or push to main, THE CI_CD_Pipeline SHALL run `prisma migrate diff` or equivalent validation to detect uncommitted schema changes.
3. IF the Prisma schema contains changes that are not reflected in a committed migration file, THEN THE CI_CD_Pipeline SHALL report a warning or failure indicating migration drift.

---

### Requirement 3: CI/CD Pipeline — Auto-Deploy to Vercel

**User Story:** As a developer, I want the application to be automatically deployed to Vercel when all checks pass on the main branch, so that production stays up to date without manual intervention.

#### Acceptance Criteria

1. WHEN all lint, test, and build steps pass on a push to the main branch, THE CI_CD_Pipeline SHALL trigger a production deployment to Vercel.
2. WHEN a deployment to Vercel is triggered, THE CI_CD_Pipeline SHALL use the Vercel CLI or Vercel GitHub integration with a deploy token stored as a GitHub Actions secret.
3. IF the Vercel deployment fails, THEN THE CI_CD_Pipeline SHALL mark the workflow run as failed and include the deployment error output in the workflow logs.
4. THE CI_CD_Pipeline SHALL configure environment variables required by the application (database URL, JWT secret, Stellar configuration) as Vercel environment variables, not hardcoded in the workflow file.

---

### Requirement 4: Soroban Smart Contract Deployment

**User Story:** As a developer, I want to deploy Soroban smart contracts to the Stellar testnet from the Next.js backend, so that the application can leverage on-chain programmable logic.

#### Acceptance Criteria

1. THE Contract_Service SHALL accept a compiled Soroban_Contract WASM binary and deploy it to the Stellar testnet via the Soroban_RPC endpoint.
2. WHEN a Soroban_Contract is successfully deployed, THE Contract_Service SHALL return the contract ID and the deployment transaction hash.
3. WHEN a Soroban_Contract deployment is requested, THE Contract_Service SHALL sign the deployment transaction using a deployer keypair managed on the backend.
4. IF the Soroban_Contract deployment transaction is rejected by the Stellar network, THEN THE Contract_Service SHALL return a descriptive error including the rejection reason.
5. THE System SHALL store deployed Soroban_Contract IDs and their associated metadata (contract type, deployer address, deployment timestamp) in the database.

---

### Requirement 5: Soroban Smart Contract Invocation

**User Story:** As a developer, I want to call Soroban smart contract functions from the Next.js backend, so that the application can read and write on-chain state programmatically.

#### Acceptance Criteria

1. WHEN a contract invocation request is received, THE Contract_Service SHALL construct a Soroban transaction invoking the specified function on the target Soroban_Contract with the provided arguments.
2. WHEN a contract invocation transaction is successfully submitted, THE Contract_Service SHALL return the transaction hash and the decoded return value from the contract function.
3. THE Contract_Service SHALL support read-only contract calls (simulations) that query contract state without submitting a transaction to the ledger.
4. IF a contract invocation transaction fails due to an on-chain error, THEN THE Contract_Service SHALL return the error code and diagnostic message from the Soroban runtime.
5. THE Contract_Service SHALL serialize function arguments to Soroban XDR format and deserialize return values from Soroban XDR format using the Stellar SDK.

---

### Requirement 6: Inter-Contract Calls

**User Story:** As a developer, I want to support inter-contract calls between multiple Soroban contracts, so that complex on-chain workflows (such as token transfers within a liquidity pool) can be composed from modular contracts.

#### Acceptance Criteria

1. WHEN a Soroban_Contract function invokes another Soroban_Contract during execution, THE System SHALL include both contracts in the transaction footprint and authorize the cross-contract invocation.
2. THE Contract_Service SHALL support constructing transactions that authorize Inter_Contract_Calls by including the required sub-contract authorizations in the transaction envelope.
3. WHEN an Inter_Contract_Call transaction is submitted, THE Contract_Service SHALL return the combined result including return values from all invoked contracts.
4. IF an Inter_Contract_Call fails due to insufficient authorization on a sub-contract, THEN THE Contract_Service SHALL return a descriptive error identifying which contract authorization is missing.
5. THE System SHALL provide an API endpoint (`POST /api/contracts/invoke`) that accepts a contract ID, function name, arguments, and optional sub-contract authorization parameters.

---

### Requirement 7: Custom Token Creation

**User Story:** As a Merchant, I want to create custom Stellar tokens using Soroban token contracts, so that I can issue branded tokens for loyalty programs or payment use cases.

#### Acceptance Criteria

1. WHEN a Merchant submits a token creation request with a token name, symbol, decimal precision, and initial supply, THE Token_Service SHALL deploy a Soroban Token_Contract implementing the SEP-41 token interface on the Stellar testnet.
2. WHEN a Token_Contract is successfully deployed, THE Token_Service SHALL mint the specified initial supply to the Merchant's Stellar address and return the token contract ID.
3. THE Token_Service SHALL store the token metadata (contract ID, name, symbol, decimals, deployer, creation timestamp) in the database linked to the Merchant's account.
4. WHEN a User or Merchant requests their token balances, THE Token_Service SHALL query each associated Token_Contract via Soroban_RPC and return the current balance for each token.
5. IF a token creation request specifies a decimal precision outside the range of 0 to 18, THEN THE Token_Service SHALL return a validation error before attempting deployment.
6. THE System SHALL provide an API endpoint (`POST /api/tokens/create`) that accepts token parameters and returns the deployed token contract ID.
7. THE System SHALL provide an API endpoint (`GET /api/tokens/balances`) that returns all token balances for the authenticated user.

---

### Requirement 8: Liquidity Pool — Deposit and Withdrawal

**User Story:** As a Merchant, I want to deposit tokens into a liquidity pool and withdraw my position, so that I can provide liquidity and earn from swap fees.

#### Acceptance Criteria

1. THE Pool_Service SHALL deploy a Liquidity_Pool Soroban_Contract that holds reserves of two tokens and tracks LP shares for each depositor.
2. WHEN a Merchant submits a deposit request with amounts of both tokens, THE Pool_Service SHALL invoke the Liquidity_Pool contract to accept the deposit and mint LP shares proportional to the deposited value.
3. WHEN a Merchant submits a withdrawal request with an LP share amount, THE Pool_Service SHALL invoke the Liquidity_Pool contract to burn the specified shares and return the proportional token amounts to the Merchant's address.
4. THE Liquidity_Pool contract SHALL enforce that deposits maintain the current reserve ratio (within a 1% slippage tolerance) to prevent pool imbalance.
5. IF a deposit or withdrawal transaction fails on-chain, THEN THE Pool_Service SHALL return a descriptive error including the Soroban runtime diagnostic message.
6. THE System SHALL provide API endpoints (`POST /api/pools/deposit` and `POST /api/pools/withdraw`) for liquidity operations.
7. THE System SHALL store LP_Position records (pool contract ID, merchant ID, share amount, deposit timestamps) in the database.

---

### Requirement 9: Liquidity Pool — Token Swap

**User Story:** As a User, I want to swap one token for another through a liquidity pool, so that I can exchange tokens without a centralized order book.

#### Acceptance Criteria

1. WHEN a User submits a swap request specifying an input token, output token, and input amount, THE Pool_Service SHALL invoke the Liquidity_Pool contract to execute the swap using the constant-product formula (x * y = k).
2. WHEN a swap is executed, THE Pool_Service SHALL return the output token amount received and the effective exchange rate.
3. THE Liquidity_Pool contract SHALL deduct a swap fee of 0.3% from the input amount before calculating the output, and the fee SHALL remain in the pool reserves.
4. IF the calculated output amount is less than the User-specified minimum output amount (slippage protection), THEN THE Pool_Service SHALL reject the swap and return a slippage error without submitting the transaction.
5. THE System SHALL provide an API endpoint (`POST /api/pools/swap`) that accepts swap parameters and returns the swap result.
6. WHEN a swap is completed, THE System SHALL record the swap transaction in the database with input token, output token, input amount, output amount, fee amount, and timestamp.

---

### Requirement 10: Dashboard Token and LP Display

**User Story:** As a Merchant, I want to see my custom token balances and liquidity pool positions on my dashboard, so that I can monitor my token portfolio alongside my XLM balance.

#### Acceptance Criteria

1. WHEN a Merchant loads their Dashboard, THE System SHALL display a token balances section listing all custom tokens held by the Merchant with token name, symbol, and current balance.
2. WHEN a Merchant loads their Dashboard, THE System SHALL display an LP positions section listing all active Liquidity_Pool positions with pool name, deposited amounts, current share value, and earned fees.
3. WHEN a User loads their Dashboard, THE System SHALL display a token balances section listing all custom tokens held by the User with token name, symbol, and current balance.
4. THE Dashboard token and LP sections SHALL refresh data from Soroban_RPC when the Dashboard is loaded, with a maximum staleness of 60 seconds.
5. IF a User or Merchant holds no custom tokens, THEN THE Dashboard SHALL display an empty state message indicating no custom tokens are held.

---

### Requirement 11: Advanced Event Streaming (Existing Feature)

**User Story:** As a User or Merchant, I want to receive real-time payment notifications in my browser without refreshing, so that I am immediately aware when funds arrive.

**Status:** This feature is already implemented in the codebase. The requirements below document the existing behavior.

#### Acceptance Criteria

1. THE SSE_Endpoint at `/api/events/stream` SHALL accept authenticated GET requests from User and Merchant roles and return a `text/event-stream` response.
2. WHEN a client connects to the SSE_Endpoint, THE Notification_Service SHALL register the connection and send an initial `connected` event containing the user ID and timestamp.
3. WHEN an inbound payment is detected via Horizon_API streaming, THE Notification_Service SHALL push a `payment_received` event to the recipient's active SSE connection containing the transaction ID, sender address, amount, memo, and timestamp.
4. WHEN a client disconnects from the SSE_Endpoint, THE Notification_Service SHALL unsubscribe the connection and release associated resources.
5. IF the Horizon_API streaming connection is interrupted, THEN THE Notification_Service SHALL reconnect using exponential backoff with a base interval of 1 second and a maximum interval of 30 seconds, calculated as min(2^attempt × base_interval, max_interval).
6. THE Notification_Service SHALL support one active SSE connection per user; WHEN a new connection is opened for a user who already has an active connection, THE Notification_Service SHALL close the previous connection before registering the new one.

---

### Requirement 12: Mobile Responsive Design (Existing Feature)

**User Story:** As a User or Merchant on a mobile device, I want the application to be fully usable on small screens with touch-friendly navigation, so that I can manage payments on the go.

**Status:** This feature is already implemented in the codebase. The requirements below document the existing behavior.

#### Acceptance Criteria

1. THE System SHALL use a mobile-first design approach with Tailwind CSS v4, where base styles target mobile viewports and larger breakpoints are applied progressively using responsive utility classes.
2. THE Bottom_Nav SHALL be fixed to the bottom of the viewport on all authenticated User and Merchant screens, providing touch-friendly navigation targets with a minimum tap area of 44×44 pixels.
3. THE Bottom_Nav SHALL display role-specific navigation items: Dashboard, Send, Contacts, History, and Profile for User role; Dashboard, QR Codes, Transactions, Analytics, and Profile for Merchant role.
4. THE Bottom_Nav SHALL visually highlight the currently active route using a distinct color (indigo-600) and support both exact-match highlighting for root dashboard routes and prefix-match highlighting for nested routes.
5. THE System SHALL render all Dashboard, payment, and profile screens without horizontal scrolling on viewport widths from 320px to 1440px.
6. THE System SHALL use glassmorphism design elements (translucent backgrounds, backdrop blur, gradient accents) consistently across all screens for a modern mobile-native visual experience.
7. THE System SHALL include entrance animations (fade-in, slide-up, scale-in) for page transitions and component loading to provide smooth visual feedback on mobile devices.
