import { fetchWithProof, payChallenge, requestChallenge } from "./challenge.js";
import { type AgentFetchOptions, type PaidChallenge } from "./types.js";

const DEFAULT_PAYMENT_TIMEOUT_MS = 30_000;
const DEFAULT_PAYMENT_POLL_INTERVAL_MS = 300;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toUrlString(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return input.url;
}

async function readBodyText(response: Response): Promise<string | undefined> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return undefined;
  }
  return response.text();
}

export async function agentFetch(
  input: RequestInfo | URL,
  options: AgentFetchOptions,
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = toUrlString(input);
  const method = options.requestInit?.method ?? "GET";
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;

  const cached = await options.tokenCache?.get(url);
  if (cached) {
    const cachedResponse = await fetchWithProof(
      input,
      options.requestInit,
      cached.authorization,
      fetchImpl,
    );
    if (cachedResponse.status !== 401 && cachedResponse.status !== 402) {
      return cachedResponse;
    }

    await options.tokenCache?.delete(url);
  }

  const response = await fetchImpl(input, options.requestInit);
  if (response.status !== 402) {
    return response;
  }

  const bodyText = await readBodyText(response.clone());
  const challenge = requestChallenge(
    bodyText === undefined
      ? {
          status: response.status,
          headers: response.headers,
        }
      : {
          status: response.status,
          headers: response.headers,
          bodyText,
        },
  );

  if (challenge.scheme === "x402") {
    if (!options.payX402) {
      throw new Error("x402 payment required but no payX402 hook provided");
    }

    if (
      typeof options.maxPaymentSats === "number" &&
      Number.isFinite(options.maxPaymentSats)
    ) {
      const maxAmountRequired = challenge.paymentRequirement.maxAmountRequired;
      const isMaxAmountRequiredInteger = /^\d+$/.test(maxAmountRequired);
      const maxAmountRequiredUnits =
        isMaxAmountRequiredInteger && BigInt(maxAmountRequired) > 0n
          ? BigInt(maxAmountRequired)
          : null;

      let challengeAmountSats: number | null = null;
      const extra = challenge.paymentRequirement.extra;
      if (maxAmountRequiredUnits !== null && extra && typeof extra === "object") {
        const amountSats = (extra as Record<string, unknown>).amountSats;
        if (typeof amountSats === "number" && Number.isFinite(amountSats)) {
          challengeAmountSats = amountSats;
        } else if (typeof amountSats === "string" && /^\d+$/.test(amountSats)) {
          const parsedAmountSats = BigInt(amountSats);
          if (parsedAmountSats <= BigInt(Number.MAX_SAFE_INTEGER)) {
            challengeAmountSats = Number(parsedAmountSats);
          }
        }
      }

      const amountToCompareSats =
        challengeAmountSats ?? options.maxPaymentSats + 1;
      if (amountToCompareSats > options.maxPaymentSats) {
        throw new Error(
          `Payment required: ${amountToCompareSats} sats exceeds limit of ${options.maxPaymentSats} sats`,
        );
      }
    }

    const paidX402 = await options.payX402(challenge, { url });
    if (!paidX402.paymentPayload) {
      throw new Error("x402 payment response missing paymentPayload");
    }

    const headers = new Headers(options.requestInit?.headers ?? {});
    headers.set("X-PAYMENT", paidX402.paymentPayload);
    return fetchImpl(input, {
      ...options.requestInit,
      method,
      headers,
    });
  }

  if (challenge.scheme === "MPP") {
    if (!options.payMpp) {
      throw new Error("MPP payment required but no payMpp hook provided");
    }

    const paidMpp = await options.payMpp(challenge, { url });
    if (!paidMpp.authorization) {
      throw new Error("MPP payment response missing authorization");
    }

    await options.tokenCache?.set(url, {
      authorization: paidMpp.authorization,
    });

    return fetchWithProof(input, { ...options.requestInit, method }, paidMpp.authorization, fetchImpl);
  }

  if (
    typeof options.maxPaymentSats === "number" &&
    Number.isFinite(options.maxPaymentSats) &&
    challenge.amountSats > options.maxPaymentSats
  ) {
    throw new Error(
      `Payment required: ${challenge.amountSats} sats exceeds limit of ${options.maxPaymentSats} sats`,
    );
  }

  let paid: PaidChallenge = await options.pay(challenge, { url });

  if (!paid.preimage) {
    const paymentId = paid.paymentId;
    if (!paymentId || !options.waitForPayment) {
      throw new Error("Payment response missing preimage and no settlement poller is configured");
    }

    const timeoutMs = options.paymentTimeoutMs ?? DEFAULT_PAYMENT_TIMEOUT_MS;
    const pollIntervalMs = options.paymentPollIntervalMs ?? DEFAULT_PAYMENT_POLL_INTERVAL_MS;
    const startedAt = now();

    while (true) {
      const settlement = await options.waitForPayment(paymentId);
      if (settlement.status === "failed") {
        throw new Error(
          `Payment ${paymentId} failed: ${settlement.failureReason ?? "unknown_failure"}`,
        );
      }

      if (settlement.status === "completed") {
        if (!settlement.preimage) {
          throw new Error(`Payment ${paymentId} completed without preimage`);
        }
        paid = {
          preimage: settlement.preimage,
          paymentId: settlement.paymentId ?? paymentId,
        };
        const amountPaidSats = settlement.amountPaidSats ?? paid.amountPaidSats;
        if (amountPaidSats !== undefined) {
          paid.amountPaidSats = amountPaidSats;
        }
        break;
      }

      if (now() - startedAt >= timeoutMs) {
        throw new Error(`Payment ${paymentId} did not settle within ${timeoutMs}ms`);
      }

      await sleep(pollIntervalMs);
    }
  }

  if (paid.amountPaidSats !== undefined && paid.amountPaidSats > challenge.amountSats) {
    throw new Error(
      `Payment required: ${paid.amountPaidSats} sats exceeds challenge amount of ${challenge.amountSats}`,
    );
  }

  const authorization = payChallenge(challenge, paid);

  if (challenge.expiresAt === undefined) {
    await options.tokenCache?.set(url, {
      authorization,
    });
  } else {
    await options.tokenCache?.set(url, {
      authorization,
      expiresAt: challenge.expiresAt,
    });
  }

  return fetchWithProof(input, { ...options.requestInit, method }, authorization, fetchImpl);
}
