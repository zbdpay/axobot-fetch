import type { PaymentChallenge, PaymentContext, PaidChallenge } from "../types.js";

/**
 * Common options interface for all Lightning payment adapters
 */
export interface LightningPaymentOptions {
  // Connection/Auth
  baseUrl?: string;
  apiKey?: string;

  // Credentials
  mnemonic?: string;
  macaroon?: string;
  rune?: string;
  password?: string;

  // Network/TLS
  certPath?: string;
  certBase64?: string;

  // Advanced
  fetchImpl?: typeof fetch;
  timeoutSeconds?: number;
  maxFeePercent?: number;
}

/**
 * Function signature for all payment adapters
 */
export type PayInvoiceFunction = (
  challenge: PaymentChallenge,
  context: PaymentContext,
  options: LightningPaymentOptions
) => Promise<PaidChallenge>;

/**
 * Adapter metadata for factory pattern
 */
export interface AdapterMetadata {
  name: string;
  description: string;
  requiredEnvVars: string[];
  optionalEnvVars: string[];
}
