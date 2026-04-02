import type { PaymentChallenge, PaymentContext, PaidChallenge } from "../types.js";
import type { LightningPaymentOptions } from "./types.js";

export interface LndPaymentOptions extends LightningPaymentOptions {
  baseUrl?: string;      // Default: https://localhost:8080
  macaroon?: string;       // Hex-encoded macaroon (required)
  certPath?: string;       // Path to TLS certificate (optional, for self-signed)
  certBase64?: string;     // Base64-encoded TLS certificate (optional)
}

/**
 * Pay a Lightning invoice using LND REST API
 * 
 * LND API: POST /v1/channels/transactions (sendPaymentSync)
 * Headers: Grpc-Metadata-macaroon: {macaroon_hex}
 * Body: { payment_request: string, timeout_seconds: number, fee_limit_sat: number }
 * Response: { payment_hash, payment_preimage, payment_route, payment_error }
 */
export async function lndPayInvoice(
  challenge: PaymentChallenge,
  context: PaymentContext,
  options: LndPaymentOptions = {},
): Promise<PaidChallenge> {
  const baseUrl = options.baseUrl ?? process.env.LND_REST_URL ?? "https://localhost:8080";
  const macaroon = options.macaroon ?? process.env.LND_MACAROON;
  
  if (!macaroon) {
    throw new Error("Missing LND macaroon. Set LND_MACAROON env var or pass macaroon option.");
  }

  const fetchImpl = options.fetchImpl ?? fetch;

  // Calculate fee limit from maxFeePercent if provided
  let feeLimitSat: number | undefined;
  if (options.maxFeePercent && challenge.amountSats > 0) {
    feeLimitSat = Math.ceil(challenge.amountSats * (options.maxFeePercent / 100));
  }

  const response = await fetchImpl(`${baseUrl}/v1/channels/transactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Grpc-Metadata-macaroon": macaroon,
    },
    body: JSON.stringify({
      payment_request: challenge.invoice,
      timeout_seconds: options.timeoutSeconds ?? 60,
      ...(feeLimitSat !== undefined && { fee_limit_sat: feeLimitSat }),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LND payment failed: ${response.status} ${body}`);
  }

  const body = await response.json() as {
    payment_hash?: string;
    payment_preimage?: string;
    payment_route?: unknown;
    payment_error?: string;
  };

  if (body.payment_error) {
    throw new Error(`LND payment error: ${body.payment_error}`);
  }

  if (!body.payment_preimage) {
    throw new Error("LND payment response missing preimage");
  }

  return {
    preimage: body.payment_preimage,
    ...(body.payment_hash && { paymentId: body.payment_hash }),
    amountPaidSats: challenge.amountSats,
  };
}
