<p align="center">
  <img src="public/next.svg" alt="StellarPay" width="120" />
</p>

<h1 align="center">⚡ StellarPay</h1>

<p align="center">
  <strong>A custodial payment platform built on the Stellar blockchain with Soroban smart contract integration</strong><br/>
  Send XLM instantly via username or QR code, create custom tokens, and manage liquidity pools — no browser extension required.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/Stellar-SDK%20v15-blue?logo=stellar" alt="Stellar SDK v15" />
  <img src="https://img.shields.io/badge/Soroban-Smart%20Contracts-orange" alt="Soroban" />
  <img src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Prisma-7-purple?logo=prisma" alt="Prisma 7" />
  <img src="https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss" alt="Tailwind CSS 4" />
</p>

---

## 📖 Table of Contents

- [Overview](#overview)
- [Features](#-features)
- [Architecture](#architecture)
- [Soroban Smart Contract Integration](#-soroban-smart-contract-integration)
- [Payment Flow](#-payment-flow)
- [Wallet & Stellar Integration](#-wallet--stellar-integration)
- [Security Model](#-security-model)
- [QR Code System](#-qr-code-system)
- [Real-Time Notifications](#-real-time-notifications)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
- [Deployment](#-deployment)
- [API Reference](#-api-reference)
- [Project Structure](#-project-structure)
- [Testing](#-testing)
- [Viewing Transactions on Chain](#-viewing-transactions-on-chain)

---

## Overview

StellarPay is a full-stack custodial payment application that lets users send and receive XLM (Stellar Lumens) through a mobile-first web interface. Users can pay via username lookup, Stellar address, or by scanning QR codes — all without needing a browser wallet extension.

Beyond basic payments, StellarPay integrates with **Soroban** (Stellar's smart contract platform) to enable custom token creation, liquidity pool management, and inter-contract calls — bringing DeFi capabilities to a user-friendly interface.

The platform handles key management server-side using AES-256-GCM encryption, so users interact with a familiar username/PIN experience while transactions settle on the Stellar blockchain in ~5 seconds.

---

## ✨ Features

### Core Payments
- **Instant XLM transfers** via username or Stellar address
- **QR code payments** — static (address only) and dynamic (address + amount)
- **Real-time notifications** via Server-Sent Events (SSE)
- **Transaction history** with filtering and pagination

### Soroban Smart Contracts
- **Contract deployment** — deploy pre-compiled WASM binaries to Stellar testnet
- **Contract invocation** — call smart contract functions with XDR serialization
- **Inter-contract calls** — authorize cross-contract invocations with sub-contract auth trees
- **Read-only simulation** — query contract state without submitting transactions

### Custom Tokens (SEP-41)
- **Token creation** — merchants deploy SEP-41 token contracts with name, symbol, decimals, and initial supply
- **Balance queries** — real-time token balance lookups via Soroban RPC
- **Dashboard display** — token balances shown on user and merchant dashboards

### Liquidity Pools
- **Pool deployment** — deploy constant-product AMM contracts
- **Deposit/Withdraw** — add or remove liquidity with LP share tracking
- **Token swaps** — swap tokens with slippage protection (simulates before submitting)
- **0.3% swap fee** — fees remain in pool reserves for liquidity providers

### Platform
- **Role-based access** — User, Merchant, and Admin roles
- **Mobile-first design** — responsive from 320px to 1440px with bottom navigation
- **CI/CD pipeline** — GitHub Actions with lint, test, build, and auto-deploy to Vercel
- **Admin panel** — user management, platform stats, account activation/deactivation

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Next.js App)                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐   │
│  │  Login/  │  │  Wallet  │  │   Send   │  │  QR Scanner/  │   │
│  │ Register │  │Dashboard │  │ Payment  │  │   Generator   │   │
│  └──────────┘  └──────────┘  └──────────┘  └───────────────┘   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                      │
│  │  Token   │  │    LP    │  │ Contract │                      │
│  │ Balances │  │Positions │  │  Deploy  │                      │
│  └──────────┘  └──────────┘  └──────────┘                      │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS + JWT Bearer Token
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     EDGE MIDDLEWARE (proxy.ts)                    │
│         JWT decode → x-user-id / x-user-role headers             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API ROUTE HANDLERS                           │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Middleware Stack: CSRF → Role Guard → Rate Limiter → Zod  │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │
│  │   Auth   │  │  Wallet  │  │ Payments │  │   QR Codes   │    │
│  │ Service  │  │ Service  │  │ Service  │  │   Service    │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐    │
│  │ Contract │  │  Token   │  │   Pool   │  │Notification  │    │
│  │ Service  │  │ Service  │  │ Service  │  │   Service    │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘    │
└────────────────────────────┬────────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
┌──────────────────┐ ┌─────────────┐ ┌──────────────────┐
│   PostgreSQL     │ │   Stellar   │ │  Soroban RPC     │
│   (Prisma ORM)   │ │  Horizon    │ │  (Smart Contracts)│
│                  │ │  (Testnet)  │ │                  │
│  • Users         │ │             │ │  • Deploy WASM   │
│  • Wallets       │ │  • Balance  │ │  • Invoke funcs  │
│  • Transactions  │ │  • Tx submit│ │  • Simulate      │
│  • Contracts     │ │  • Streams  │ │  • XDR encode    │
│  • Tokens        │ │             │ │                  │
│  • LP Positions  │ │             │ │                  │
│  • Swaps         │ │             │ │                  │
└──────────────────┘ └─────────────┘ └──────────────────┘
```

---

## 🔗 Soroban Smart Contract Integration

### Contract Service

The `ContractService` provides three core operations for interacting with Soroban smart contracts:

```typescript
// Deploy a pre-compiled WASM binary
deployContract(wasmBuffer, deployerSecret)
  → { contractId, transactionHash }

// Invoke a contract function (state-changing)
invokeContract(contractId, functionName, args, callerSecret, subAuth?)
  → { transactionHash, returnValue }

// Simulate a contract call (read-only, no tx submitted)
simulateContract(contractId, functionName, args)
  → { returnValue }
```

### Inter-Contract Calls

When a pool contract calls a token contract's `transfer` function during a swap, the transaction must include authorization entries for both contracts:

```typescript
const subAuth: SubContractAuth[] = [{
  contractId: tokenContractId,
  functionName: 'transfer',
  args: [fromAddress, toAddress, amount],
  subInvocations: [] // nested calls if needed
}];

await invokeContract(poolId, 'swap', swapArgs, secret, subAuth);
```

The service recursively builds `SorobanAuthorizedInvocation` trees and includes them in the transaction envelope.

### Token Creation Flow

```
Merchant → POST /api/tokens/create
    │
    ├─ Deploy SEP-41 WASM binary
    ├─ Invoke initialize(admin, decimals, name, symbol)
    ├─ Invoke mint(to, initialSupply)
    └─ Store metadata in Token table
         → { contractId, transactionHash }
```

### Liquidity Pool Swap Flow

```
User → POST /api/pools/swap
    │
    ├─ Verify PIN
    ├─ Simulate swap (check slippage)
    │   └─ If output < minOutput → reject (400)
    ├─ Build subAuth for token transfer
    ├─ Submit swap transaction
    └─ Record in SwapTransaction table
         → { outputAmount, effectiveRate, feeAmount, transactionHash }
```

---

## 💸 Payment Flow

```
User initiates payment (username or Stellar address + amount + PIN)
         │
         ▼
┌─────────────────────────────────────────┐
│ 1. Resolve recipient                     │
│    • Username → DB lookup → stellarAddr  │
│    • Or validate Stellar address (G...)  │
├─────────────────────────────────────────┤
│ 2. Check sender balance                  │
│    • Query Horizon for live XLM balance  │
│    • Verify: balance ≥ amount + 1 XLM   │
├─────────────────────────────────────────┤
│ 3. Verify PIN                            │
│    • Check lockout status (5 attempts)   │
│    • bcrypt compare against stored hash  │
├─────────────────────────────────────────┤
│ 4. Decrypt sender's secret key           │
│    • AES-256-GCM decrypt from DB         │
├─────────────────────────────────────────┤
│ 5. Build & sign Stellar transaction      │
│    • Payment operation (native XLM)      │
│    • Optional text memo                  │
│    • Sign with Ed25519 keypair           │
├─────────────────────────────────────────┤
│ 6. Submit to Horizon                     │
│    • Returns transaction hash on success │
├─────────────────────────────────────────┤
│ 7. Record in database                    │
│    • COMPLETED or FAILED status          │
├─────────────────────────────────────────┤
│ 8. Zero secret key from memory           │
└─────────────────────────────────────────┘
```

---

## 🔑 Wallet & Stellar Integration

StellarPay uses a **custodial wallet model** — the server generates and manages Stellar keypairs on behalf of users.

| Step | What Happens |
|------|-------------|
| **Registration** | User signs up with username/email/password |
| **Keypair Generation** | Ed25519 keypair created via `Keypair.random()` |
| **Account Funding** | Friendbot funds 10,000 test XLM (testnet) |
| **Key Encryption** | Secret key encrypted with AES-256-GCM |
| **Storage** | Only public key + encrypted secret stored |
| **Balance Query** | Live balance fetched from Horizon API |

---

## 🛡️ Security Model

| Layer | Mechanism |
|-------|-----------|
| **Authentication** | JWT (24h expiry) with Edge middleware |
| **Authorization** | Role-based (USER, MERCHANT, ADMIN) |
| **Transaction Auth** | 4-6 digit PIN + bcrypt (cost 12) |
| **Lockout** | 5 failed PINs → 15 min lock |
| **Key Protection** | AES-256-GCM + HKDF |
| **CSRF** | Token validation on all mutations |
| **Rate Limiting** | Per-user/IP sliding window |
| **Input Validation** | Zod schemas on every request |

---

## 📱 QR Code System

- **Static QR** — encodes merchant's Stellar address only
- **Dynamic QR** — encodes address + amount + description for one-scan payment
- **Scanner** — camera-based QR reader that pre-fills the payment form

---

## 📡 Real-Time Notifications

- SSE endpoint at `/api/events/stream` pushes `payment_received` events
- Horizon payment stream monitors inbound transactions
- Exponential backoff reconnection: `min(2^N × 1000ms, 30s)`
- One active connection per user (new connection closes previous)

---

## 🛠️ Tech Stack

| Category | Technology |
|----------|-----------|
| **Framework** | Next.js 16 (App Router, Turbopack) |
| **Language** | TypeScript 5 |
| **Blockchain** | Stellar SDK v15 + Soroban RPC |
| **Database** | PostgreSQL + Prisma 7 ORM |
| **Styling** | Tailwind CSS 4 |
| **Auth** | JWT (jsonwebtoken) + bcrypt |
| **Encryption** | Node.js crypto (AES-256-GCM + HKDF) |
| **Validation** | Zod 4 |
| **QR Codes** | qrcode + html5-qrcode |
| **Testing** | Jest 30 + fast-check (property-based) |
| **CI/CD** | GitHub Actions + Vercel |

---

## 🚀 Getting Started

### Prerequisites

- Node.js 22+
- PostgreSQL database
- npm

### 1. Clone & Install

```bash
git clone <your-repo-url>
cd stellar-pay
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Fill in your `.env`:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/stellarpay
JWT_SECRET=your-jwt-secret-here
ENCRYPTION_MASTER_KEY=your-64-char-hex-key
STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
HORIZON_URL=https://horizon-testnet.stellar.org
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
```

Generate an encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Setup Database

```bash
npx prisma generate
npx prisma migrate deploy
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 5. Run Tests

```bash
npm test
```

---

## 🌐 Deployment

### Deploy to Vercel

1. Push your code to GitHub
2. Import the repository at [vercel.com](https://vercel.com)
3. Set environment variables in Vercel dashboard:

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | PostgreSQL connection string (Neon, Supabase, or Vercel Postgres) |
| `JWT_SECRET` | Random 32+ character string |
| `ENCRYPTION_MASTER_KEY` | 64-character hex string |
| `HORIZON_URL` | `https://horizon-testnet.stellar.org` |
| `STELLAR_NETWORK_PASSPHRASE` | `Test SDF Network ; September 2015` |
| `SOROBAN_RPC_URL` | `https://soroban-testnet.stellar.org` |

4. Run initial migration against your production database:
```bash
DATABASE_URL="your-production-url" npx prisma migrate deploy
```

### CI/CD Pipeline

The GitHub Actions workflow (`.github/workflows/ci.yml`) automatically:
- Runs ESLint
- Checks Prisma migration drift
- Runs the full test suite (915 tests)
- Builds the production bundle
- Deploys to Vercel on push to `main`

---

## 📚 API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new user/merchant |
| POST | `/api/auth/login` | Login and receive JWT |

### Wallet
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/wallet` | Get Stellar address + live XLM balance |

### Payments
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/payments/send` | Send XLM (requires PIN) |
| GET | `/api/payments/history` | Transaction history (paginated) |

### Smart Contracts
| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| POST | `/api/contracts/deploy` | MERCHANT | Deploy a WASM contract |
| POST | `/api/contracts/invoke` | USER, MERCHANT | Invoke a contract function |
| POST | `/api/contracts/simulate` | USER, MERCHANT | Simulate a call (read-only) |

### Tokens
| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| POST | `/api/tokens/create` | MERCHANT | Create a SEP-41 token |
| GET | `/api/tokens/balances` | USER, MERCHANT | Get all token balances |

### Liquidity Pools
| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| POST | `/api/pools/deposit` | MERCHANT | Deposit into a pool |
| POST | `/api/pools/withdraw` | MERCHANT | Withdraw from a pool |
| POST | `/api/pools/swap` | USER, MERCHANT | Swap tokens |
| GET | `/api/pools/positions` | MERCHANT | Get LP positions |

### QR Codes
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/qr/static` | Generate static QR |
| POST | `/api/qr/dynamic` | Generate dynamic QR |
| POST | `/api/qr/parse` | Parse scanned QR payload |

### Users
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/users/pin` | Set transaction PIN |
| POST | `/api/users/pin/verify` | Verify PIN |
| GET | `/api/users/search` | Search users by username |

### Contacts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/contacts` | List saved contacts |
| POST | `/api/contacts` | Add a contact |
| DELETE | `/api/contacts/[id]` | Remove a contact |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/dashboard` | Platform stats |
| GET | `/api/admin/users` | List all users |
| PATCH | `/api/admin/users/[id]/status` | Activate/deactivate user |

### Real-Time
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/events/stream` | SSE stream for payment notifications |

---

## 📁 Project Structure

```
stellar-pay/
├── .github/workflows/ci.yml   # CI/CD pipeline
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── proxy.ts               # Edge middleware (JWT decode)
│   ├── app/
│   │   ├── (auth)/            # Login & registration pages
│   │   ├── (dashboard)/       # Protected dashboard pages
│   │   │   ├── admin/         # Admin panel
│   │   │   ├── merchant/      # Merchant dashboard
│   │   │   └── user/          # User dashboard
│   │   └── api/               # API route handlers
│   │       ├── auth/          # Register, login
│   │       ├── contracts/     # Deploy, invoke, simulate
│   │       ├── tokens/        # Create, balances
│   │       ├── pools/         # Deposit, withdraw, swap, positions
│   │       ├── payments/      # Send, history
│   │       ├── wallet/        # Balance & address
│   │       ├── qr/            # Static, dynamic, parse
│   │       ├── contacts/      # CRUD contacts
│   │       ├── users/         # PIN, search
│   │       ├── admin/         # Dashboard, user management
│   │       └── events/        # SSE stream
│   ├── components/            # React components
│   │   ├── TokenBalanceList.tsx
│   │   ├── LPPositionList.tsx
│   │   ├── BalanceCard.tsx
│   │   ├── BottomNav.tsx
│   │   ├── QRScanner.tsx
│   │   └── PinGateScreen.tsx
│   └── lib/
│       ├── services/          # Business logic
│       │   ├── contract.service.ts   # Soroban deploy/invoke/simulate
│       │   ├── token.service.ts      # SEP-41 token operations
│       │   ├── pool.service.ts       # Liquidity pool operations
│       │   ├── stellar.service.ts    # Horizon interactions
│       │   ├── payment.service.ts    # XLM transfers
│       │   ├── encryption.service.ts # AES-256-GCM
│       │   ├── pin.service.ts        # PIN management
│       │   └── notification.service.ts # SSE + Horizon streaming
│       ├── middleware/        # Request middleware
│       └── validators/        # Zod schemas
├── test/setup.ts              # Jest test setup
└── package.json
```

---

## 🧪 Testing

915 tests across 63 test suites covering:
- Service layer unit tests (contract, token, pool, payment, auth, PIN)
- API route integration tests (all endpoints)
- Validator tests (all Zod schemas)
- Component logic tests
- Property-based tests (fast-check)

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

---

## 🔭 Viewing Transactions on Chain

Every successful payment is recorded on the Stellar blockchain:

- **Testnet Explorer**: [https://stellar.expert/explorer/testnet](https://stellar.expert/explorer/testnet)
- **Account view**: `https://stellar.expert/explorer/testnet/account/<YOUR_ADDRESS>`
- **Transaction view**: `https://stellar.expert/explorer/testnet/tx/<TX_HASH>`

```bash
# Get your Stellar address
curl -H "Authorization: Bearer <jwt>" http://localhost:3000/api/wallet
```

---

## 📄 License

Private project — all rights reserved.
