import { randomUUID } from "node:crypto";

import type { PaidChallenge, PaymentChallenge, PaymentContext } from "../types.js";
import type { LightningPaymentOptions } from "./types.js";

const DEFAULT_ZBD_API_BASE_URL = "https://api.zbdpay.com";

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }

  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }

  return undefined;
}

function resolveShieldEnabled(explicitValue: boolean | undefined, axoBaseUrl: string | undefined): boolean {
  if (explicitValue !== undefined) {
    return explicitValue;
  }

  const envValue = parseBooleanEnv(process.env.ZBD_SHIELD_ENABLED);
  if (envValue !== undefined) {
    return envValue;
  }

  return typeof axoBaseUrl === "string" && axoBaseUrl.length > 0;
}

function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError;
}

interface PaymentResponse {
  preimage?: string;
  paymentId?: string;
  amountPaidSats?: number;
}

async function parseResponseJson(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return {};
  }

  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function toPaymentResponse(body: Record<string, unknown>, fallbackAmountSats: number): PaymentResponse {
  const nested =
    body.data && typeof body.data === "object" ? (body.data as Record<string, unknown>) : undefined;

  const paymentId =
    (typeof body.id === "string" ? body.id : undefined) ??
    (typeof body.payment_id === "string" ? body.payment_id : undefined) ??
    (nested && typeof nested.id === "string" ? nested.id : undefined) ??
    (nested && typeof nested.payment_id === "string" ? nested.payment_id : undefined);

  const preimage =
    (typeof body.preimage === "string" ? body.preimage : undefined) ??
    (nested && typeof nested.preimage === "string" ? nested.preimage : undefined);

  const rawAmount =
    (typeof body.amount_sats === "number" ? body.amount_sats : undefined) ??
    (typeof body.amountSats === "number" ? body.amountSats : undefined) ??
    (nested && typeof nested.amount_sats === "number" ? nested.amount_sats : undefined) ??
    (nested && typeof nested.amountSats === "number" ? nested.amountSats : undefined) ??
    fallbackAmountSats;

  const result: PaymentResponse = {
    amountPaidSats: Number(rawAmount),
  };
  if (preimage !== undefined) {
    result.preimage = preimage;
  }
  if (paymentId !== undefined) {
    result.paymentId = paymentId;
  }
  return result;
}

function toPaidChallenge(parsed: PaymentResponse): PaidChallenge {
  const result: PaidChallenge = {
    preimage: parsed.preimage ?? "",
  };
  if (parsed.paymentId !== undefined) {
    result.paymentId = parsed.paymentId;
  }
  if (parsed.amountPaidSats !== undefined) {
    result.amountPaidSats = parsed.amountPaidSats;
  }
  return result;
}

/**
 * ZBD-specific payment options extending LightningPaymentOptions
 */
export interface ZbdL402PaymentOptions extends LightningPaymentOptions {
  /** ZBD API base URL (default: https://api.zbdpay.com) */
  zbdApiBaseUrl?: string;
  /** Axo Shield base URL for shield mode */
  axoBaseUrl?: string;
  /** Enable shield mode (auto-enabled if axoBaseUrl is set) */
  shieldEnabled?: boolean;
  /** Logger for warning messages */
  warningLogger?: (message: string) => void;
  /** Factory for generating idempotency keys */
  idempotencyKeyFactory?: () => string;
}

/**
 * Pay a Lightning invoice directly using ZBD API
 * 
 * ZBD API: POST /v0/payments
 * Headers: apikey: {apiKey}
 * Body: { invoice: string }
 * Response: { data: { id, preimage, amount_sats } }
 */
export async function zbdPayInvoiceDirect(
  invoice: string,
  amountSats: number,
  options: ZbdL402PaymentOptions,
): Promise<PaidChallenge> {
  const apiKey = options.apiKey ?? process.env.ZBD_API_KEY;
  if (!apiKey) {
    throw new Error("Missing ZBD_API_KEY for direct L402 payment");
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const zbdApiBaseUrl = options.zbdApiBaseUrl ?? process.env.ZBD_API_BASE_URL ?? DEFAULT_ZBD_API_BASE_URL;

  const response = await fetchImpl(`${zbdApiBaseUrl}/v0/payments`, {
    method: "POST",
    headers: {
      apikey: apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      invoice,
    }),
  });

  const body = await parseResponseJson(response);
  if (!response.ok) {
    throw new Error(`Direct L402 payment failed: ${response.status} ${JSON.stringify(body)}`);
  }

  return toPaidChallenge(toPaymentResponse(body, amountSats));
}

/**
 * Pay a Lightning invoice using ZBD with optional Axo Shield
 * 
 * Supports two modes:
 * 1. Shield mode: Routes payment through Axo Shield for approval/rejection
 * 2. Direct mode: Pays invoice directly via ZBD API
 * 
 * Shield mode is enabled when shieldEnabled=true or axoBaseUrl is provided.
 * Falls back to direct payment on network failures.
 */
export async function zbdPayL402Invoice(
  challenge: PaymentChallenge,
  context: PaymentContext,
  options: ZbdL402PaymentOptions = {},
): Promise<PaidChallenge> {
  const axoBaseUrl = options.axoBaseUrl ?? process.env.AXO_BASE_URL;
  const shieldEnabled = resolveShieldEnabled(options.shieldEnabled, axoBaseUrl);
  const idempotencyKeyFactory = options.idempotencyKeyFactory ?? (() => `agent-fetch-l402-${randomUUID()}`);

  if (shieldEnabled && axoBaseUrl) {
    const apiKey = options.apiKey ?? process.env.ZBD_API_KEY;
    if (!apiKey) {
      throw new Error("Missing ZBD_API_KEY for shield L402 payment");
    }

    const fetchImpl = options.fetchImpl ?? fetch;

    try {
      const response = await fetchImpl(`${axoBaseUrl}/api/shield/l402`, {
        method: "POST",
        headers: {
          apikey: apiKey,
          "x-api-key": apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          invoice: challenge.invoice,
          amount_sats: challenge.amountSats,
          url: context.url,
          idempotency_key: idempotencyKeyFactory(),
        }),
      });

      const body = await parseResponseJson(response);

      if (response.status === 403) {
        const reason = typeof body.reason === "string" ? body.reason : "allowance_exceeded";
        const approvalId = typeof body.approval_id === "string" ? body.approval_id : undefined;
        throw new Error(
          approvalId
            ? `Shield blocked L402 payment: ${reason} (approval_id=${approvalId})`
            : `Shield blocked L402 payment: ${reason}`,
        );
      }

      if (response.status === 202) {
        const approvalId = typeof body.approval_id === "string" ? body.approval_id : "unknown";
        throw new Error(`Shield approval pending for L402 payment (approval_id=${approvalId})`);
      }

      if (!response.ok) {
        throw new Error(`Shield L402 payment failed: ${response.status} ${JSON.stringify(body)}`);
      }

      return toPaidChallenge(toPaymentResponse(body, challenge.amountSats));
    } catch (error) {
      if (!isNetworkFailure(error)) {
        throw error;
      }

      const warningLogger = options.warningLogger ?? ((message: string) => console.warn(message));
      warningLogger("Shield unreachable for L402 payment, falling back to direct payment");
    }
  }

  return zbdPayInvoiceDirect(challenge.invoice, challenge.amountSats, options);
}
