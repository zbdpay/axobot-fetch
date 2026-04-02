// Export common types
export type {
  LightningPaymentOptions,
  PayInvoiceFunction,
  AdapterMetadata,
} from "./types.js";

// Re-export from types.ts for convenience
export type { PaymentChallenge, PaymentContext, PaidChallenge } from "../types.js";

// Export Phoenixd adapter
export { phoenixdPayInvoice } from "./phoenixd-payment.js";
export type { PhoenixdPaymentOptions } from "./phoenixd-payment.js";

// Export CLN adapter
export { clnPayInvoice } from "./cln-payment.js";
export type { ClnPaymentOptions } from "./cln-payment.js";

// Export ZBD adapter
export { zbdPayL402Invoice, zbdPayInvoiceDirect } from "./zbd-payment.js";
export type { ZbdL402PaymentOptions } from "./zbd-payment.js";

// Export LND adapter
export { lndPayInvoice } from "./lnd-payment.js";
export type { LndPaymentOptions } from "./lnd-payment.js";

// Export Breez Spark adapter
export { breezSparkPayInvoice } from "./breez-spark-payment.js";
export type { BreezSparkPaymentOptions } from "./breez-spark-payment.js";
// Export factory functions
export {
  createPaymentAdapter,
  detectPaymentAdapter,
  detectAdapterType,
  getAdapterMetadata,
  listAvailableAdapters,
} from "./factory.js";
export type { AdapterType } from "./factory.js";

