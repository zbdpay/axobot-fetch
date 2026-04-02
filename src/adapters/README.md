# Payment Adapters

This directory contains Lightning Network payment adapters for different node implementations.

## Architecture

Each adapter implements the `PayInvoiceFunction` type:

```typescript
(challenge, context, options) => Promise<PaidChallenge>
```

## Common Options

All adapters accept `LightningPaymentOptions`:

- `baseUrl` - Node API endpoint
- `apiKey` - API authentication key
- `mnemonic` - Recovery phrase (for some wallets)
- `macaroon` - LND macaroon authentication
- `rune` - CLN rune authentication
- `password` - Node password
- `certPath` / `certBase64` - TLS certificate
- `fetchImpl` - Custom fetch implementation
- `timeoutSeconds` - Payment timeout
- `maxFeePercent` - Maximum routing fee percentage

## Environment-Based Configuration

Adapters prefer environment variables for configuration:

- `ZBD_API_KEY` - ZBD API authentication
- `PHOENIXD_API_KEY` / `PHOENIXD_API_PASSWORD` - Phoenixd authentication
- `CLN_RUNE` / `CLN_MACAROON` - Core Lightning authentication
- `LND_MACAROON` / `LND_CERT` - LND authentication

## Creating a New Adapter

1. Create a new file: `src/adapters/{name}-payment.ts`
2. Implement the `PayInvoiceFunction` interface
3. Export adapter metadata
4. Add tests in `test/adapters/{name}-payment.test.ts`

## Existing Adapters

- `zbd-payment.ts` - ZBD API (already exists in `src/`)
- `phoenixd-payment.ts` - Phoenixd wallet (planned)
- `cln-payment.ts` - Core Lightning (planned)
