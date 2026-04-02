export { axoFetch } from "./axo-fetch.js";
export { requestChallenge, payChallenge, fetchWithProof } from "./challenge.js";
export { FileTokenCache } from "./file-token-cache.js";
export { zbdPayMpp } from "./mpp-payment.js";
export { zbdPayL402Invoice } from "./zbd-payment.js";
export { zbdPayX402 } from "./zbd-x402-payment.js";
export type { MppSessionStore, ZbdMppPaymentOptions } from "./mpp-payment.js";
export type { ZbdL402PaymentOptions } from "./zbd-payment.js";
export type { ZbdX402PaymentOptions } from "./zbd-x402-payment.js";
// NEW: Export all payment adapters
export { phoenixdPayInvoice } from "./adapters/phoenixd-payment.js";
export { clnPayInvoice } from "./adapters/cln-payment.js";
export { lndPayInvoice } from "./adapters/lnd-payment.js";
export { breezSparkPayInvoice } from "./adapters/breez-spark-payment.js";

// NEW: Export factory functions
export {
  createPaymentAdapter,
  detectPaymentAdapter,
  detectAdapterType,
  getAdapterMetadata,
  listAvailableAdapters,
} from "./adapters/factory.js";

// NEW: Export adapter types
export type {
  LightningPaymentOptions,
  PayInvoiceFunction,
  AdapterMetadata,
  AdapterType,
} from "./adapters/index.js";

export type {
  PhoenixdPaymentOptions,
  ClnPaymentOptions,
  LndPaymentOptions,
  BreezSparkPaymentOptions,
} from "./adapters/index.js";

export type {
  AnyPaymentChallenge,
  AgentFetchOptions,
  ChallengeScheme,
  MppPaidChallenge,
  MppPaymentChallenge,
  X402PaymentChallenge,
  X402PaidChallenge,
  PaymentContext,
  PaidChallenge,
  PaymentSettlement,
  PaymentChallenge,
  TokenCache,
  TokenRecord,
} from "./types.js";
