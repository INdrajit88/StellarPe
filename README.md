<p align="center">
  <img src="public/next.svg" alt="StellarPay" width="120" />
</p>

<h1 align="center">⚡ StellarPay</h1>

<p align="center">
  <strong>A custodial payment platform built on the Stellar blockchain</strong><br/>
  Send XLM instantly via username or QR code — no browser extension required.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/Stellar-SDK%20v15-blue?logo=stellar" alt="Stellar SDK v15" />
  <img src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Prisma-7-purple?logo=prisma" alt="Prisma 7" />
  <img src="https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss" alt="Tailwind CSS 4" />
</p>

---

## 📖 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Payment Flow](#-payment-flow)
- [Wallet & Stellar Integration](#-wallet--stellar-integration)
- [Security Model](#-security-model)
- [QR Code System](#-qr-code-system)
- [Real-Time Notifications](#-real-time-notifications)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
- [API Reference](#-api-reference)
- [Project Structure](#-project-structure)
- [Viewing Transactions on Chain](#-viewing-transactions-on-chain)

---

## Overview

StellarPay is a full-stack custodial payment application that lets users send and receive XLM (Stellar Lumens) through a mobile-first web interface. Users can pay via username lookup, Stellar address, or by scanning QR codes — all without needing a browser wallet extension.

The platform handles key management server-side using AES-256-GCM encryption, so users interact with a familiar username/PIN experience while transactions settle on the Stellar blockchain in ~5 seconds.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Next.js App)                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐   │
│  │  Login/  │  │  Wallet  │  │   Send   │  │  QR Scanner/  │   │
│  │ Register │  │Dashboard │  │ Payment  │  │   Generator   │   │
│  └──────────┘  └──────────┘  └──────────┘  └───────────────┘   │
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
│  │   PIN    │  │Encryption│  │ Stellar  │  │Notification  │    │
│  │ Service  │  │ Service  │  │ Service  │  │   Service    │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘    │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
┌──────────────────┐ ┌─────────────┐ ┌──────────────────┐
│   PostgreSQL     │ │   Stellar   │ │  Horizon API     │
│   (Prisma ORM)   │ │  Network    │ │  (SSE Streams)   │
│                  │ │  (Testnet)  │ │                  │
│  • Users         │ │             │ │  • Balance query │
│  • Wallets       │ │  • Ledger   │ │  • Tx submission │
│  • Transactions  │ │  • Accounts │ │  • Payment stream│
│  • Contacts      │ │  • Payments │ │                  │
└──────────────────┘ └─────────────┘ └──────────────────┘
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
│      (1 XLM = Stellar minimum reserve)   │
├─────────────────────────────────────────┤
│ 3. Verify PIN                            │
│    • Check lockout status (5 attempts)   │
│    • bcrypt compare against stored hash  │
│    • Increment failures on mismatch      │
├─────────────────────────────────────────┤
│ 4. Decrypt sender's secret key           │
│    • AES-256-GCM decrypt from DB         │
│    • Key held in memory only for signing │
├─────────────────────────────────────────┤
│ 5. Build & sign Stellar transaction      │
│    • Load account (sequence number)      │
│    • Payment operation (native XLM)      │
│    • Optional text memo                  │
│    • Sign with Ed25519 keypair           │
├─────────────────────────────────────────┤
│ 6. Submit to Horizon                     │
│    • 30-second timeout                   │
│    • Returns transaction hash on success │
├─────────────────────────────────────────┤
│ 7. Record in database                    │
│    • COMPLETED or FAILED status          │
│    • Store stellarTxId for chain lookup  │
├─────────────────────────────────────────┤
│ 8. Zero secret key from memory           │
│    • Overwrite string reference           │
│    • Original eligible for GC            │
└─────────────────────────────────────────┘
```

---

## 🔑 Wallet & Stellar Integration

### How Wallets Work

StellarPay uses a **custodial wallet model** — the server generates and manages Stellar keypairs on behalf of users. This eliminates the need for browser extensions or seed phrase management.

| Step | What Happens | Where |
|------|-------------|-------|
| **Registration** | User signs up with username/email/password | Client → API |
| **Keypair Generation** | Ed25519 keypair created via `Keypair.random()` | Server (StellarService) |
| **Account Funding** | Friendbot funds 10,000 test XLM (testnet) | Server → Stellar Testnet |
| **Key Encryption** | Secret key encrypted with AES-256-GCM | Server (EncryptionService) |
| **Storage** | Only public key + encrypted secret stored | PostgreSQL |
| **Balance Query** | Live balance fetched from Horizon API | Server → Horizon |

### Stellar SDK Usage

```typescript
// Keypair generation (registration)
const keypair = Keypair.random();
// → publicKey: "GABCD..." (56 chars, starts with G)
// → secretKey: "SABCD..." (56 chars, starts with S)

// Transaction building (payment)
new TransactionBuilder(senderAccount, { fee: BASE_FEE, networkPassphrase })
  .addOperation(Operation.payment({
    destination: recipientPublic,
    asset: Asset.native(),  // XLM
    amount: "10.5"
  }))
  .addMemo(Memo.text("Coffee payment"))
  .setTimeout(30)
  .build();

// Real-time streaming (notifications)
server.payments().forAccount(publicKey).cursor('now').stream({
  onmessage: (payment) => { /* notify user via SSE */ }
});
```

### Key Encryption Flow

```
                    ENCRYPTION_MASTER_KEY (env var)
                              │
                              ▼
                    ┌─────────────────┐
                    │  HKDF-SHA256    │
                    │  salt: fixed    │
                    │  info: context  │
                    └────────┬────────┘
                             │
                    256-bit derived key
                             │
              ┌──────────────┼──────────────┐
              ▼                             ▼
     ┌─────────────────┐          ┌─────────────────┐
     │    ENCRYPT       │          │    DECRYPT       │
     │  AES-256-GCM    │          │  AES-256-GCM    │
     │  Random 12B IV  │          │  Stored IV      │
     └────────┬────────┘          └────────┬────────┘
              │                             │
              ▼                             ▼
     ciphertext + IV + authTag      plaintext secret key
     (stored in DB as hex)          (held in memory only)
```

---

## 🛡️ Security Model

| Layer | Mechanism | Details |
|-------|-----------|---------|
| **Authentication** | JWT (24h expiry) | Edge middleware decodes, route handlers verify signature |
| **Authorization** | Role-based (USER, MERCHANT, ADMIN) | Role guard middleware per route |
| **Transaction Auth** | 4-6 digit PIN + bcrypt (cost 12) | Required before every payment |
| **Lockout** | 5 failed PINs → 15 min lock | Prevents brute-force PIN guessing |
| **Key Protection** | AES-256-GCM + HKDF | Secret keys never stored in plaintext |
| **CSRF** | Token validation on mutations | All POST/PUT/DELETE routes |
| **Rate Limiting** | Per-user/IP sliding window | Auth: 10/min, Payments: 20/min |
| **Input Validation** | Zod schemas | Every request body validated |
| **Memory Safety** | Secret key zeroing | Keys overwritten after signing |

---

## 📱 QR Code System

StellarPay supports two types of QR codes for payments:

### Static QR
Encodes only the merchant's Stellar address. The payer enters the amount manually.
```json
{ "address": "GABCDEF..." }
```

### Dynamic QR
Encodes address + amount + optional description. One-scan payment.
```json
{ "address": "GABCDEF...", "amount": "25.00", "description": "Coffee order #42" }
```

### QR Flow
```
Merchant generates QR  →  User scans with camera  →  App parses JSON payload
                                                            │
                                                            ▼
                                                   Pre-fills payment form
                                                   (address + amount)
                                                            │
                                                            ▼
                                                   User confirms + enters PIN
                                                            │
                                                            ▼
                                                   Payment submitted to Stellar
```

---

## 📡 Real-Time Notifications

```
┌──────────────┐         ┌──────────────────┐         ┌─────────────┐
│   Stellar    │  SSE    │  NotificationSvc │  SSE    │   Client    │
│   Horizon    │────────▶│  (Server)        │────────▶│  (Browser)  │
│              │ stream  │                  │ push    │             │
│  Payment     │         │  • Record in DB  │         │  • Toast    │
│  detected    │         │  • Map to userId │         │  • Refresh  │
│              │         │  • Push to SSE   │         │    balance  │
└──────────────┘         └──────────────────┘         └─────────────┘

Reconnection: Exponential backoff — min(2^N × 1000ms, 30s)
```

---

## 🛠️ Tech Stack

| Category | Technology |
|----------|-----------|
| **Framework** | Next.js 16 (App Router) |
| **Language** | TypeScript 5 |
| **Blockchain** | Stellar SDK v15 + Horizon API |
| **Database** | PostgreSQL + Prisma 7 ORM |
| **Styling** | Tailwind CSS 4 |
| **Auth** | JWT (jsonwebtoken) + bcrypt |
| **Encryption** | Node.js crypto (AES-256-GCM + HKDF) |
| **Validation** | Zod 4 |
| **QR Codes** | qrcode (server) + html5-qrcode (client scanner) |
| **Testing** | Jest 30 + fast-check (property-based) |

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database
- npm or yarn

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
# PostgreSQL connection string
DATABASE_URL=postgresql://user:password@localhost:5432/stellarpay

# Secret for signing JWTs (use a strong random string)
JWT_SECRET=your-jwt-secret-here

# Master key for AES-256-GCM encryption of Stellar secret keys
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_MASTER_KEY=your-64-char-hex-key

# Stellar network (defaults to testnet)
STELLAR_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
HORIZON_URL=https://horizon-testnet.stellar.org
```

### 3. Setup Database

```bash
npx prisma generate
npx prisma db push
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
| GET | `/api/payments/history` | Transaction history (paginated, filterable) |

### QR Codes
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/qr/static` | Generate static QR (address only) |
| POST | `/api/qr/dynamic` | Generate dynamic QR (address + amount) |
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
├── prisma/
│   └── schema.prisma          # Database schema (User, Wallet, Transaction, Contact)
├── src/
│   ├── app/
│   │   ├── (auth)/            # Login & registration pages
│   │   ├── (dashboard)/       # Protected dashboard pages
│   │   │   ├── admin/         # Admin panel
│   │   │   ├── merchant/      # Merchant dashboard (QR, analytics)
│   │   │   └── user/          # User dashboard (send, scan, history)
│   │   └── api/               # API route handlers
│   │       ├── auth/          # Register, login
│   │       ├── payments/      # Send, history
│   │       ├── wallet/        # Balance & address
│   │       ├── qr/            # Static, dynamic, parse
│   │       ├── contacts/      # CRUD contacts
│   │       ├── users/         # PIN, search
│   │       ├── admin/         # Dashboard, user management
│   │       └── events/        # SSE stream
│   ├── components/            # React components
│   │   ├── BalanceCard.tsx     # Wallet balance display
│   │   ├── QRScanner.tsx      # Camera-based QR scanner
│   │   ├── QRCodeDisplay.tsx  # QR code renderer
│   │   ├── TransactionList.tsx# Transaction history list
│   │   └── PinGateScreen.tsx  # PIN entry modal
│   └── lib/
│       ├── services/          # Business logic layer
│       │   ├── auth.service.ts
│       │   ├── wallet.service.ts
│       │   ├── payment.service.ts
│       │   ├── stellar.service.ts
│       │   ├── encryption.service.ts
│       │   ├── pin.service.ts
│       │   ├── qr.service.ts
│       │   ├── notification.service.ts
│       │   └── contact.service.ts
│       ├── middleware/        # Request middleware
│       │   ├── csrf.ts
│       │   ├── rate-limiter.ts
│       │   ├── role-guard.ts
│       │   └── validator.ts
│       ├── validators/        # Zod schemas
│       └── prisma.ts          # Prisma client instance
└── package.json
```

---

## 🔭 Viewing Transactions on Chain

Every successful payment is recorded on the Stellar blockchain. You can verify transactions using:

### StellarExpert (Block Explorer)

- **Testnet**: [https://stellar.expert/explorer/testnet](https://stellar.expert/explorer/testnet)
- **Mainnet**: [https://stellar.expert/explorer/public](https://stellar.expert/explorer/public)

### Find Your Public Key

Your Stellar address (public key) is stored in the `Wallet` table. Retrieve it via:

```bash
# Via the API (while authenticated)
curl -H "Authorization: Bearer <your-jwt>" http://localhost:3000/api/wallet
# Returns: { "stellarAddress": "GABCD...", "balance": "9999.99" }
```

### View Account Transactions

```
https://stellar.expert/explorer/testnet/account/<YOUR_STELLAR_ADDRESS>
```

### View a Specific Transaction

```
https://stellar.expert/explorer/testnet/tx/<STELLAR_TX_HASH>
```

### Horizon API (Direct)

```bash
# Account details
curl https://horizon-testnet.stellar.org/accounts/<YOUR_STELLAR_ADDRESS>

# Transaction history
curl https://horizon-testnet.stellar.org/accounts/<YOUR_STELLAR_ADDRESS>/transactions
```

---

## 🧪 Testing

The project uses **Jest** for unit/integration tests and **fast-check** for property-based testing.

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

Test files are co-located with their source in `__tests__/` directories.

---

## 📄 License

Private project — all rights reserved.
