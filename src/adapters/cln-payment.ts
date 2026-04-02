import type { PaymentChallenge, PaymentContext, PaidChallenge } from "../types.js";
import type { LightningPaymentOptions } from "./types.js";

export interface ClnPaymentOptions extends LightningPaymentOptions {
  baseUrl?: string;      // Default: https://localhost:3010
  rune?: string;           // CLN rune for auth (required)
  certPath?: string;       // Path to TLS certificate (optional, for self-signed)
}

/**
 * Pay a Lightning invoice using Core Lightning (CLNRest)
 * 
 * CLNRest API: POST /v1/pay
 * Headers: Rune: {rune}
 * Body: { bolt11: string, amount_msat?: number }
 * Response: { payment_hash, preimage, status, amount_msat, amount_sent_msat }
 */
export async function clnPayInvoice(
  challenge: PaymentChallenge,
  context: PaymentContext,
  options: ClnPaymentOptions = {},
): Promise<PaidChallenge> {
  const baseUrl = options.baseUrl ?? process.env.CLN_REST_URL ?? "https://localhost:3010";
  const rune = options.rune ?? process.env.CLN_RUNE;
  
  if (!rune) {
    throw new Error("Missing CLN rune. Set CLN_RUNE env var or pass rune option.");
  }

  const fetchImpl = options.fetchImpl ?? fetch;

  // Prepare request options
  const requestInit: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Rune": rune,
    },
    body: JSON.stringify({
      bolt11: challenge.invoice,
      // amount_msat is optional - only for amountless invoices
    }),
  };

  // Handle self-signed certificate if certPath provided
  // Note: In Node.js fetch, we may need to use an agent with custom TLS
  // For now, assume fetchImpl handles it or user uses http for localhost

  const response = await fetchImpl(`${baseUrl}/v1/pay`, requestInit);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`CLN payment failed: ${response.status} ${body}`);
  }

  const body = await response.json() as {
    payment_hash?: string;
    preimage?: string;
    status?: string;
    amount_msat?: number;
    amount_sent_msat?: number;
  };

  if (!body.preimage) {
    throw new Error("CLN payment response missing preimage");
  }

  return {
    preimage: body.preimage,
    ...(body.payment_hash && { paymentId: body.payment_hash }),
    amountPaidSats: challenge.amountSats,
  };
}
