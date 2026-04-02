import type { PaymentChallenge, PaymentContext, PaidChallenge } from "../types.js";
import type { LightningPaymentOptions } from "./types.js";

export interface PhoenixdPaymentOptions extends LightningPaymentOptions {
  baseUrl?: string;      // Default: http://localhost:9740
  password?: string;       // API password (required)
}

/**
 * Pay a Lightning invoice using Phoenixd
 * 
 * Phoenixd API: POST /payinvoice
 * Headers: Authorization: Bearer {password}
 * Body: { invoice: string, amountSat?: number }
 * Response: { paymentId, paymentHash, preimage, fees, completedAt }
 */
export async function phoenixdPayInvoice(
  challenge: PaymentChallenge,
  context: PaymentContext,
  options: PhoenixdPaymentOptions = {},
): Promise<PaidChallenge> {
  const baseUrl = options.baseUrl ?? process.env.PHOENIXD_BASE_URL ?? "http://localhost:9740";
  const password = options.password ?? process.env.PHOENIXD_API_PASSWORD;
  
  if (!password) {
    throw new Error("Missing Phoenixd API password. Set PHOENIXD_API_PASSWORD env var or pass password option.");
  }

  const fetchImpl = options.fetchImpl ?? fetch;

  const response = await fetchImpl(`${baseUrl}/payinvoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${password}`,
    },
    body: JSON.stringify({
      invoice: challenge.invoice,
      // amountSat is optional - only for amountless invoices
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Phoenixd payment failed: ${response.status} ${body}`);
  }

  const body = await response.json() as {
    paymentId?: string;
    paymentHash?: string;
    preimage?: string;
    fees?: number;
    completedAt?: number;
  };

  if (!body.preimage) {
    throw new Error("Phoenixd payment response missing preimage");
  }

  return {
    preimage: body.preimage,
    ...(body.paymentId && { paymentId: body.paymentId }),
    amountPaidSats: challenge.amountSats,
  };
}
