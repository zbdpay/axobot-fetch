import type { PaymentChallenge, PaymentContext, PaidChallenge } from "../types.js";
import type { LightningPaymentOptions } from "./types.js";

// Breez SDK type declarations (local types to avoid hard dependency on @breeztech/breez-sdk-spark)
// These will be replaced by actual SDK types when the package is installed

interface BreezSdk {
  prepareSendPayment(request: PrepareSendPaymentRequest): Promise<PrepareSendPaymentResponse>;
  sendPayment(request: SendPaymentRequest): Promise<SendPaymentResponse>;
}

interface PrepareSendPaymentRequest {
  paymentRequest: string;
  amount?: number; // For amountless invoices
}

interface PrepareSendPaymentResponse {
  paymentMethod: string;
  amountSats: number;
  feeSats: number;
}

interface SendPaymentRequest {
  prepareResponse: PrepareSendPaymentResponse;
}

interface SendPaymentResponse {
  payment: {
    id: string;
    preimage?: string;
    status: string;
    amount: number;
  };
}

interface BreezConfig {
  apiKey: string;
  // Additional config options depend on SDK version
}

export interface BreezSparkPaymentOptions extends LightningPaymentOptions {
  apiKey?: string;         // Breez API key (required)
  mnemonic?: string;         // Wallet mnemonic/seed phrase (required)
  workingDir?: string;     // SDK working directory
}

// Singleton SDK instance manager
class BreezSdkManager {
  private static instance: BreezSdk | null = null;
  private static initializing: Promise<BreezSdk> | null = null;
  
  static async getInstance(options: BreezSparkPaymentOptions): Promise<BreezSdk> {
    if (this.instance) {
      return this.instance;
    }
    
    if (this.initializing) {
      return this.initializing;
    }
    
    this.initializing = this.initialize(options);
    return this.initializing;
  }
  
  private static async initialize(options: BreezSparkPaymentOptions): Promise<BreezSdk> {
    const apiKey = options.apiKey ?? process.env.BREEZ_SDK_API_KEY;
    const mnemonic = options.mnemonic ?? process.env.BREEZ_SDK_MNEMONIC;
    
    if (!apiKey || !mnemonic) {
      throw new Error("Missing Breez SDK credentials. Set BREEZ_SDK_API_KEY and BREEZ_SDK_MNEMONIC env vars.");
    }
    
    // Dynamic import to avoid hard dependency
    // @ts-expect-error - Module may not be installed, caught at runtime
    const breezSdk = await import("@breeztech/breez-sdk-spark");
    const { connect, defaultConfig } = breezSdk as {
      connect: (args: { config: unknown; mnemonic: string }) => Promise<BreezSdk>;
      defaultConfig: (network: string, apiKey: string) => unknown;
    };
    
    const config = defaultConfig("mainnet", apiKey);
    // Apply workingDir if provided
    if (options.workingDir) {
      // config.workingDir = options.workingDir; // Depends on SDK version
    }
    
    const sdk = await connect({ config, mnemonic });
    this.instance = sdk;
    return sdk;
  }
}

/**
 * Pay a Lightning invoice using Breez Spark SDK
 * 
 * Two-step process:
 * 1. prepareSendPayment - Get fee estimate and validate
 * 2. sendPayment - Execute the payment
 */
export async function breezSparkPayInvoice(
  challenge: PaymentChallenge,
  context: PaymentContext,
  options: BreezSparkPaymentOptions = {},
): Promise<PaidChallenge> {
  // Get or initialize SDK instance
  const sdk = await BreezSdkManager.getInstance(options);
  
  // Step 1: Prepare payment
  const prepareResponse = await sdk.prepareSendPayment({
    paymentRequest: challenge.invoice,
    // amount only needed for amountless invoices
  });
  
  // Step 2: Send payment
  const sendResponse = await sdk.sendPayment({
    prepareResponse,
  });
  
  const payment = sendResponse.payment;
  
  if (!payment.preimage) {
    throw new Error("Breez Spark payment response missing preimage");
  }
  
  return {
    preimage: payment.preimage,
    paymentId: payment.id,
    amountPaidSats: challenge.amountSats,
  };
}
