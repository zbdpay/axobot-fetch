# Engineering Contract — `@zbdpay/agent-fetch`

> **Status**: Normative. All implementation work in this repository must conform to every rule in this document.
> **Scope**: L402 client library. Handles challenge parsing, ZBD payment execution, preimage proof assembly, and token caching on behalf of callers.

---

## 1. Auth Header

### 1.1 ZBD API Authentication

All outbound calls to `api.zbdpay.com` from this library MUST include the caller-supplied API key in the `apikey` HTTP header (lowercase). No other header name is accepted by the ZBD API.

```
apikey: <caller-supplied-api-key>
```

The library MUST NOT log, persist, or expose the raw API key value. It is passed through to ZBD API calls only.

### 1.2 L402 Authorization Header (outbound proof)

After a successful payment, the library MUST retry the original request with the following header, using the `L402` scheme as specified in bLIP-26:

```
Authorization: L402 <macaroon>:<preimage>
```

The library MUST also accept and produce the legacy `LSAT` scheme for backward compatibility with servers that have not yet migrated:

```
Authorization: LSAT <macaroon>:<preimage>
```

Scheme detection is case-insensitive. When parsing a `WWW-Authenticate` challenge, the library MUST accept both `L402` and `LSAT` as valid scheme identifiers.

### 1.3 Challenge Parsing

The `WWW-Authenticate` response header from a 402 response MUST be parsed for both key variants:

- `macaroon` key (preferred, bLIP-26 standard)
- `token` key (legacy alias — treated identically to `macaroon`)

The 402 response body MAY also carry the challenge as JSON. The library MUST support both header-only and body-JSON challenge delivery. Fields extracted from the challenge:

| Field | Type | Required | Notes |
|---|---|---|---|
| `macaroon` / `token` | string | YES | Opaque credential bound to the payment |
| `invoice` | string | YES | BOLT11 invoice to pay |
| `paymentHash` | string | YES | Used to verify preimage after payment |
| `amountSats` | number | YES | Invoice amount in satoshis (boundary unit — see Section 2) |
| `expiresAt` | number | NO | Unix timestamp; library MUST NOT use expired tokens |

---

## 2. Amount Units

### 2.1 Internal Representation

All monetary amounts are stored and processed internally in **millisatoshis (msat)**. One satoshi equals 1000 msat. The ZBD API returns and accepts msat values on payment endpoints.

```
1 sat = 1000 msat
```

### 2.2 Boundary Outputs

All public API surfaces of this library — function return values, callback arguments, error messages, and log output — MUST express amounts in **satoshis (sat)**, not msat.

```typescript
// Correct: boundary output in sats
onPayment: (amountSats: number, invoice: string) => void

// Correct: error message in sats
throw new Error(`Payment required: ${amountSats} sats exceeds limit of ${opts.maxPaymentSats}`)

// Forbidden: exposing msat at the boundary
onPayment: (amountMsat: number, invoice: string) => void  // NEVER
```

### 2.3 Conversion Rule

When the ZBD API returns an msat value, the library MUST divide by 1000 before surfacing it at any public boundary. Fractional satoshis MUST be rounded down (floor).

```typescript
const amountSats = Math.floor(amountMsat / 1000)
```

### 2.4 Max Payment Guard

The `maxPaymentSats` option is compared against the sat-boundary value after conversion. The guard MUST fire before any payment call is made.

---

## 3. Release Policy

### 3.1 Versioning

This package follows **Semantic Versioning 2.0.0** (semver). Version increments are determined automatically by `semantic-release` based on Conventional Commits in the default branch.

| Commit prefix | Version bump |
|---|---|
| `fix:` | patch |
| `feat:` | minor |
| `feat!:` or `BREAKING CHANGE:` footer | major |

### 3.2 Publishing

Releases are published to the public npm registry under the `@zbdpay` scope. Publishing uses **npm OIDC Trusted Publishing** via GitHub Actions — no long-lived npm tokens are stored in repository secrets. The workflow exchanges a short-lived GitHub OIDC token for a scoped npm publish token at release time.

The npm package provenance attestation (`--provenance` flag) MUST be enabled on every publish run so consumers can verify the build origin.

### 3.3 Release Branch

The `main` branch is the only release branch. Pre-release channels (`next`, `beta`) may be added but are not required for Phase 1.

### 3.4 Changelog

`semantic-release` generates `CHANGELOG.md` automatically from commit history. Manual edits to `CHANGELOG.md` are forbidden — all changelog content must flow from commit messages.

### 3.5 No Manual Publishes

Publishing by running `npm publish` locally is forbidden. All publishes go through the CI release workflow. Any publish outside CI is considered a policy violation.

---

## 4. Compatibility Policy

### 4.1 L402 / bLIP-26

This library targets full compliance with the bLIP-26 L402 specification. The implementation MUST:

- Accept `WWW-Authenticate: L402 ...` challenge headers
- Accept `WWW-Authenticate: LSAT ...` challenge headers (legacy compat)
- Accept both `macaroon` and `token` field names in challenge payloads
- Produce `Authorization: L402 <macaroon>:<preimage>` on retry
- Produce `Authorization: LSAT <macaroon>:<preimage>` when the server issued an `LSAT` challenge

Servers using Lightning Labs Aperture, moneydevkit, or any other bLIP-26-compliant implementation MUST be interoperable with this client without configuration changes.

### 4.2 LNURL

This library does not implement LNURL-pay directly. LNURL destination resolution is delegated to the ZBD API (`POST /v0/ln-address/pay`). The library MUST NOT attempt to resolve LNURL endpoints itself.

### 4.3 Node.js Runtime

Minimum supported runtime: **Node.js 22 LTS**. No support for older Node.js versions or browser environments in Phase 1.

### 4.4 ZBD API Version

This library targets the `v0` ZBD API surface. If ZBD introduces a `v1` API, a new major version of this package will be released. The `v0` surface MUST remain functional until the package reaches `2.0.0`.

### 4.5 Async Payment Settlement

ZBD payment confirmation is asynchronous. After calling `POST /v0/payments`, the library MUST poll `GET /v0/payments/:id` until the status is `completed` or `failed`, or until a configurable timeout is reached. The library MUST NOT assume the preimage is available synchronously after the initial payment POST.

### 4.6 Token Cache Compatibility

The `FileTokenCache` format is a JSON object keyed by URL. The schema is considered stable within a major version. Any change to the cache schema that would invalidate existing cache files requires a major version bump.

---

*Last updated: 2026-02-25. Maintained by the ZBD agent suite team.*
