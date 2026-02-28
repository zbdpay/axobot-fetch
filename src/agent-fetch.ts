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
