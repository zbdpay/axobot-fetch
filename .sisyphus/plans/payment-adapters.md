# Payment Adapter Architecture Plan

## Overview
Implement multiple Lightning payment adapters for axobot-fetch following the Strategy Pattern with unified interface.

## Scope

**INCLUDE:**
1. Breez Spark SDK adapter
2. LND adapter (REST API)
3. Phoenixd adapter
4. Core Lightning (CLNRest) adapter
5. Refactor existing ZBD adapter to common interface
6. Factory pattern for auto-detection

**EXCLUDE:**
- Breez Liquid SDK (explicitly skipped per user)
- Money Dev Kit (too low-level, not a direct payment method)
- gRPC implementations (use REST only for simplicity)

## Key Design Decisions

### Common Interface
All adapters implement:
```typescript
type PayInvoiceFunction = (
  challenge: PaymentChallenge,
  context: PaymentContext,
  options: AdapterOptions
) => Promise<PaidChallenge>;
```

### Adapter Complexity Ranking (easiest to hardest):
1. **Phoenixd** - Simple HTTP POST, password auth
2. **CLN** - REST API with Rune auth
3. **ZBD** (refactor) - Existing HTTP API
4. **LND** - REST + macaroon + TLS handling
5. **Breez Spark** - SDK lifecycle, mnemonic, 2-step payment

### Breez Spark SDK Specifics
- **Stateful**: Requires SDK initialization with mnemonic
- **Two-step**: prepareSendPayment → sendPayment
- **Preimage**: Available in payment.preimage after completion
- **Server-side**: Use Node.js native bindings (not WASM)

## TODOs

- [x] 1. Create adapter directory structure and common types
- [x] 2. Implement Phoenixd adapter
- [x] 3. Implement CLN adapter
- [x] 4. Refactor ZBD to common interface
- [x] 5. Implement LND adapter
- [x] 6. Implement Breez Spark adapter
- [x] 7. Create factory pattern and auto-detection
- [x] 8. Add examples for each adapter
- [x] 9. Update exports and documentation

## Execution Strategy

### Wave 1 (Foundation):
- Task 1: Directory structure + common types
- Task 2: Phoenixd adapter (simplest)
- Task 3: CLN adapter

### Wave 2 (Core):
- Task 4: ZBD refactor
- Task 5: LND adapter

### Wave 3 (Complex):
- Task 6: Breez Spark SDK adapter
- Task 7: Factory pattern

### Wave 4 (Final):
- Task 8: Examples + docs
- Task 9: Export updates + tests

## Success Criteria

All adapters must:
1. Return `PaidChallenge` with preimage
2. Support environment-based configuration
3. Have TypeScript types
4. Include working example
5. Handle errors consistently

## Verification

Run `npm run typecheck` after each wave.
Test each adapter against live nodes/services.
