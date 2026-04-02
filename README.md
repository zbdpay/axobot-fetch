# @axobot/fetch

L402-aware fetch client for paid HTTP resources.

This package handles the full payment challenge flow:
- parse `402 Payment Required` responses
- support both `L402` and `LSAT` schemes
- pay using caller-provided hooks
- retry with `Authorization` proof
- cache proofs locally to avoid duplicate payments

Want to run this immediately? See [Examples (Fastest Way to Run)](#examples-fastest-way-to-run).

## Requirements

- Node.js `>=22`
- npm

## Install

```bash
npm install @axobot/fetch
```

## Quick Start

```ts
import { axoFetch, FileTokenCache } from "@axobot/fetch";

const tokenCache = new FileTokenCache(`${process.env.HOME}/.zbd-wallet/token-cache.json`);

const response = await axoFetch("https://example.com/protected", {
  tokenCache,
  maxPaymentSats: 100,
  pay: async (challenge) => {
    // Pay challenge.invoice with your wallet implementation.
    // Return preimage, plus optional paymentId/amountPaidSats.
    return {
      preimage: "<payment-preimage>",
      paymentId: "<payment-id>",
      amountPaidSats: challenge.amountSats,
    };
  },
  waitForPayment: async (paymentId) => {
    // Optional poller for async settlement.
    // Return pending/completed/failed.
    return {
      status: "completed",
      paymentId,
      preimage: "<payment-preimage>",
      amountPaidSats: 21,
    };
  },
});

const body = await response.json();
console.log(response.status, body);
```

## Behavior

- If cached auth exists and is not expired, request is sent immediately with proof.
- If response is not `402`, original response is returned untouched.
- If response is `402`, challenge is parsed from `WWW-Authenticate` and/or JSON body.
- If payment succeeds, proof is generated as `<SCHEME> <macaroon-or-token>:<preimage>` and request is retried.
- If `maxPaymentSats` is set and challenge exceeds it, call fails before payment.
- If async settlement is used and times out, call fails with a timeout error.

## Public API

Exports from `src/index.ts`:

- `axoFetch`
- `requestChallenge`
- `payChallenge`
- `fetchWithProof`
- `FileTokenCache`
- types: `AgentFetchOptions`, `PaymentChallenge`, `PaidChallenge`, `PaymentSettlement`, `TokenCache`, `TokenRecord`, `ChallengeScheme`

## Options (`AgentFetchOptions`)

- `pay` (required): function to pay a parsed challenge
- `waitForPayment` (optional): poller for async settlement
- `tokenCache` (optional): token cache backend
- `requestInit` (optional): forwarded fetch options
- `fetchImpl` (optional): custom fetch implementation
- `maxPaymentSats` (optional): payment guardrail
- `paymentTimeoutMs` (optional, default `30000`)
- `paymentPollIntervalMs` (optional, default `300`)
- `now`, `sleep` (optional testability hooks)

## Token Cache

`FileTokenCache` stores per-URL tokens as JSON and writes atomically.

- no `expiresAt`: token is reused until overwritten/deleted
- with `expiresAt`: expired token is evicted on read

Default cache location is chosen by the caller. In this suite, `axobot-cli` uses `~/.zbd-wallet/token-cache.json`.

## Examples (Fastest Way to Run)

If you want a working paid-request flow in minutes, start with these scripts before wiring your own app code.

- `examples/zbd-agent-fetch.mjs`: end-to-end paid fetch using ZBD API for invoice payment
- `examples/fetch-with-known-proof.mjs`: call a protected endpoint with a precomputed L402 token

Run from this repo:

```bash
npm run build
PROTECTED_URL="http://localhost:8787/protected" ZBD_API_KEY=<your_api_key> npm run example:zbd
```

If you already have an authorization token:

```bash
PROTECTED_URL="http://localhost:8787/protected" L402_AUTHORIZATION="L402 <macaroon>:<preimage>" npm run example:proof
```

## Scripts

```bash
npm run build
npm run test
npm run lint
npm run typecheck
npm run smoke:imports
npm run example:zbd
npm run example:proof
npm run release:dry-run
```

## Related Packages

- `@axobot/cli` uses this package for `axo fetch`
- `@axobot/pay` provides middleware that emits L402 challenges this client can consume

## Payment Adapters

This package includes built-in payment adapters for popular Lightning Network node implementations. These adapters handle invoice payment automatically, so you don't need to write custom `pay` functions.

### Available Adapters

| Adapter | Node Type | Required Env Var |
|---------|-----------|------------------|
| `zbd` | ZBD API | `ZBD_API_KEY` |
| `phoenixd` | Phoenixd | `PHOENIXD_API_PASSWORD` |
| `cln` | Core Lightning | `CLN_RUNE` |
| `lnd` | LND | `LND_MACAROON` |
| `breez-spark` | Breez SDK | `BREEZ_SDK_API_KEY`, `BREEZ_SDK_MNEMONIC` |

### Quick Start with Adapters

Use the factory function for zero-config setup (auto-detects from environment):

```ts
import { axoFetch, FileTokenCache, detectPaymentAdapter } from "@axobot/fetch";

const tokenCache = new FileTokenCache(`${process.env.HOME}/.zbd-wallet/token-cache.json`);
const pay = detectPaymentAdapter(); // Auto-detects based on env vars

const response = await axoFetch("https://example.com/protected", {
  tokenCache,
  maxPaymentSats: 100,
  pay,
});
```

### Explicit Adapter Selection

If you know which adapter you want to use:

```ts
import { createPaymentAdapter } from "@axobot/fetch";

// Use ZBD adapter explicitly
const pay = createPaymentAdapter("zbd");

// Use LND adapter explicitly
const pay = createPaymentAdapter("lnd", {
  baseUrl: "https://localhost:8080",
  macaroon: process.env.LND_MACAROON,
});
```

### Adapter Configuration

Each adapter can be configured via environment variables or explicit options:

**ZBD Adapter**
- `ZBD_API_KEY` (required) - Your ZBD API key
- `ZBD_API_BASE_URL` (optional) - Custom API base URL
- `ZBD_SHIELD_ENABLED` (optional) - Enable shield mode

**Phoenixd Adapter**
- `PHOENIXD_API_PASSWORD` (required) - Phoenixd API password
- `PHOENIXD_BASE_URL` (optional) - Custom node URL (default: http://localhost:9740)

**Core Lightning Adapter**
- `CLN_RUNE` (required) - CLN rune for authentication
- `CLN_REST_URL` (optional) - CLNRest URL (default: https://localhost:3010)

**LND Adapter**
- `LND_MACAROON` (required) - Hex-encoded macaroon
- `LND_REST_URL` (optional) - LND REST URL (default: https://localhost:8080)

**Breez Spark Adapter**
- `BREEZ_SDK_API_KEY` (required) - Breez API key
- `BREEZ_SDK_MNEMONIC` (required) - Wallet mnemonic
- `BREEZ_SDK_WORKING_DIR` (optional) - SDK working directory

### Factory Functions

- `createPaymentAdapter(type, options?)` - Create a specific adapter by type
- `detectPaymentAdapter(options?)` - Auto-detect and create adapter from env vars (throws if none found)
- `detectAdapterType()` - Check which adapter would be detected (returns null if none)
- `getAdapterMetadata(type)` - Get adapter info (name, description, required env vars)
- `listAvailableAdapters()` - Get all available adapter type names

### Adapter Types

Exported TypeScript types for adapters:

```ts
import type {
  LightningPaymentOptions,  // Common options for all adapters
  PayInvoiceFunction,       // Adapter function signature
  AdapterMetadata,          // Adapter metadata
  AdapterType,              // Union of all adapter types
  ZbdL402PaymentOptions,    // ZBD-specific options
  PhoenixdPaymentOptions,   // Phoenixd-specific options
  ClnPaymentOptions,        // CLN-specific options
  LndPaymentOptions,        // LND-specific options
  BreezSparkPaymentOptions, // Breez-specific options
} from "@axobot/fetch";
```
