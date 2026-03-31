import { randomUUID } from "node:crypto";

import type { PaymentContext, X402PaidChallenge, X402PaymentChallenge } from "./types.js";

export interface ZbdX402PaymentOptions {
  apiKey?: string;
  axoBaseUrl?: string;
  fetchImpl?: typeof fetch;
  idempotencyKeyFactory?: () => string;
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

export function zbdPayX402(options: ZbdX402PaymentOptions = {}) {
  return async (
    challenge: X402PaymentChallenge,
    _context?: PaymentContext,
  ): Promise<X402PaidChallenge> => {
    const apiKey = options.apiKey ?? process.env.ZBD_API_KEY;
    if (!apiKey) {
      throw new Error("Missing ZBD_API_KEY for x402 shield payment");
    }

    const axoBaseUrl = options.axoBaseUrl ?? process.env.AXO_BASE_URL;
    if (!axoBaseUrl) {
      throw new Error("Missing AXO_BASE_URL for x402 shield payment");
    }
      throw new Error("Missing AXO_BASE_URL for x402 shield payment");

    const fetchImpl = options.fetchImpl ?? fetch;
    const idempotencyKeyFactory = options.idempotencyKeyFactory ?? (() => `agent-fetch-x402-${randomUUID()}`);

    const response = await fetchImpl(`${axoBaseUrl}/api/shield/x402`, {
      method: "POST",
      headers: {
        apikey: apiKey,
        "x-api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        paymentRequirement: challenge.paymentRequirement,
        idempotency_key: idempotencyKeyFactory(),
      }),
    });

    const body = await parseResponseJson(response);

    if (response.status === 403) {
      const reason = typeof body.reason === "string" ? body.reason : "allowance_exceeded";
      throw new Error(`Shield blocked x402 payment: ${reason}`);
    }

    if (response.status === 202) {
      const approvalId = typeof body.approval_id === "string" ? body.approval_id : "unknown";
      throw new Error(`Shield approval pending for x402 payment (approval_id=${approvalId})`);
    }

    if (!response.ok) {
      throw new Error(`Shield x402 payment failed: ${response.status} ${JSON.stringify(body)}`);
    }

    const paymentPayload = typeof body.paymentPayload === "string" ? body.paymentPayload : undefined;
    if (!paymentPayload) {
      throw new Error("Shield x402 payment response missing paymentPayload");
    }

    return { paymentPayload };
  };
}
