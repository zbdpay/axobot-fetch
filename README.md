# @zbdpay/agent-fetch

L402-aware fetch client for paid HTTP resources.

This package handles the full payment challenge flow:
- parse `402 Payment Required` responses
- support both `L402` and `LSAT` schemes
- pay using caller-provided hooks
- retry with `Authorization` proof
- cache proofs locally to avoid duplicate payments

## Requirements

- Node.js `>=22`
- npm

## Install

```bash
npm install @zbdpay/agent-fetch
```

## Quick Start

```ts
import { agentFetch, FileTokenCache } from "@zbdpay/agent-fetch";

const tokenCache = new FileTokenCache(`${process.env.HOME}/.zbd-wallet/token-cache.json`);

const response = await agentFetch("https://example.com/protected", {
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

- `agentFetch`
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

Default cache location is chosen by the caller. In this suite, `agent-wallet` uses `~/.zbd-wallet/token-cache.json`.

## Scripts

```bash
npm run build
npm run test
npm run lint
npm run typecheck
npm run smoke:imports
npm run release:dry-run
```

## Related Packages

- `@zbdpay/agent-wallet` uses this package for `zbdw fetch`
- `@zbdpay/agent-pay` provides middleware that emits L402 challenges this client can consume
