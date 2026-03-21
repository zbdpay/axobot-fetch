import { parsePaymentAuthenticateHeader } from "@axobot/mppx";
import {
  type AnyPaymentChallenge,
  type MppPaymentChallenge,
  type PaidChallenge,
  type PaymentChallenge,
  type X402PaymentChallenge,
} from "./types.js";

interface ChallengeInput {
  status: number;
  headers: Headers;
  bodyText?: string;
}

function parseHeaderPairs(input: string): Record<string, string> {
  const pairs: Record<string, string> = {};
  for (const part of input.split(",")) {
    const [rawKey, rawValue] = part.split("=");
    if (!rawKey || !rawValue) {
      continue;
    }
    const key = rawKey.trim();
    const value = rawValue.trim().replace(/^"|"$/g, "");
    if (key.length > 0 && value.length > 0) {
      pairs[key] = value;
    }
  }
  return pairs;
}

function parseBodyChallenge(bodyText?: string): Partial<PaymentChallenge> {
  if (!bodyText) {
    return {};
  }

  try {
    const parsed = JSON.parse(bodyText) as Record<string, unknown>;
    const source =
      parsed.challenge && typeof parsed.challenge === "object"
        ? (parsed.challenge as Record<string, unknown>)
        : parsed;
    const amount = source.amountSats;
    const schemeValue = typeof source.scheme === "string" ? source.scheme.toUpperCase() : "L402";
    const result: Partial<PaymentChallenge> = {
      scheme: schemeValue === "LSAT" ? "LSAT" : "L402",
      macaroon:
        typeof source.macaroon === "string"
          ? source.macaroon
          : typeof source.token === "string"
            ? source.token
            : "",
      invoice: typeof source.invoice === "string" ? source.invoice : "",
      paymentHash:
        typeof source.paymentHash === "string"
          ? source.paymentHash
          : typeof source.payment_hash === "string"
            ? source.payment_hash
            : "",
      amountSats: typeof amount === "number" ? amount : Number.NaN,
    };

    if (typeof source.expiresAt === "number") {
      result.expiresAt = source.expiresAt;
    }

    return result;
  } catch {
    return {};
  }
}

function parseX402Challenge(bodyText?: string): X402PaymentChallenge | null {
  if (!bodyText) {
    return null;
  }

  try {
    const parsed = JSON.parse(bodyText) as Record<string, unknown>;
    if (!("x402Version" in parsed)) {
      return null;
    }

    const accepts = parsed.accepts;
    if (!Array.isArray(accepts) || accepts.length === 0) {
      return null;
    }

    const first = accepts[0];
    if (!first || typeof first !== "object") {
      return null;
    }

    return {
      scheme: "x402",
      paymentRequirement: first as X402PaymentChallenge["paymentRequirement"],
    };
  } catch {
    return null;
  }
}

export function requestChallenge(input: ChallengeInput): AnyPaymentChallenge {
  if (input.status !== 402) {
    throw new Error("requestChallenge expects a 402 response");
  }

  const paymentHeader = input.headers.get("www-authenticate") ?? "";
  if (paymentHeader.trim().toLowerCase().startsWith("payment ")) {
    return {
      scheme: "MPP",
      challenge: parsePaymentAuthenticateHeader(paymentHeader),
    } satisfies MppPaymentChallenge;
  }

  const x402Challenge = parseX402Challenge(input.bodyText);
  if (x402Challenge) {
    return x402Challenge;
  }

  const header = input.headers.get("www-authenticate") ?? "";
  const [rawScheme = "", ...rest] = header.split(" ");
  const headerFields = parseHeaderPairs(rest.join(" "));
  const fromBody = parseBodyChallenge(input.bodyText);

  const schemeUpper = rawScheme.toUpperCase();
  const scheme =
    schemeUpper === "LSAT" ? "LSAT" : schemeUpper === "L402" ? "L402" : fromBody.scheme ?? "L402";
  const macaroon = headerFields.macaroon ?? headerFields.token ?? fromBody.macaroon;
  const invoice = headerFields.invoice ?? fromBody.invoice;
  const paymentHash = headerFields.paymentHash ?? headerFields.payment_hash ?? fromBody.paymentHash;
  const amountSatsRaw =
    headerFields.amountSats ??
    headerFields.amount ??
    (typeof fromBody.amountSats === "number" ? String(fromBody.amountSats) : undefined);
  const amountSats = amountSatsRaw ? Number(amountSatsRaw) : Number.NaN;
  const expiresAt =
    headerFields.expiresAt !== undefined
      ? Number(headerFields.expiresAt)
      : fromBody.expiresAt;

  if (!macaroon || !invoice || !paymentHash || !Number.isFinite(amountSats)) {
    throw new Error("Invalid payment challenge");
  }

  const challenge: PaymentChallenge = {
    scheme,
    macaroon,
    invoice,
    paymentHash,
    amountSats,
  };

  if (typeof expiresAt === "number") {
    challenge.expiresAt = expiresAt;
  }

  return challenge;
}

export function payChallenge(challenge: PaymentChallenge, paid: PaidChallenge): string {
  if (!paid.preimage) {
    throw new Error("Missing preimage");
  }

  return `${challenge.scheme} ${challenge.macaroon}:${paid.preimage}`;
}

export async function fetchWithProof(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  authorization: string,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const headers = new Headers(init?.headers ?? {});
  headers.set("authorization", authorization);

  return fetchImpl(input, {
    ...init,
    headers,
  });
}
