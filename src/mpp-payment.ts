import {
  createLightningSessionBearerAuthorization,
  createZbdLightningAdapter,
  openLightningSession,
  payLightningChargeChallenge,
  type LightningSessionHandle,
} from "@axobot/mppx";

import type {
  MppPaidChallenge,
  MppPaymentChallenge,
  PaymentContext,
} from "./types.js";

export interface MppSessionStore {
  get(key: string): Promise<LightningSessionHandle | null>;
  set(key: string, session: LightningSessionHandle): Promise<void>;
  delete(key: string): Promise<void>;
}

class InMemoryMppSessionStore implements MppSessionStore {
  readonly sessions = new Map<string, LightningSessionHandle>();

  async get(key: string): Promise<LightningSessionHandle | null> {
    return this.sessions.get(key) ?? null;
  }

  async set(key: string, session: LightningSessionHandle): Promise<void> {
    this.sessions.set(key, session);
  }

  async delete(key: string): Promise<void> {
    this.sessions.delete(key);
  }
}

export interface ZbdMppPaymentOptions {
  apiKey?: string;
  zbdApiBaseUrl?: string;
  fetchImpl?: typeof fetch;
  source?: string | undefined;
  returnInvoice?: string | undefined;
  returnLightningAddress?: string | undefined;
  sessionStore?: MppSessionStore;
  keyForContext?: (challenge: MppPaymentChallenge, context?: PaymentContext) => string;
}

export function zbdPayMpp(
  options: ZbdMppPaymentOptions = {},
): (challenge: MppPaymentChallenge, context?: PaymentContext) => Promise<MppPaidChallenge> {
  const adapter = createZbdLightningAdapter({
    apiKey: options.apiKey ?? process.env.ZBD_API_KEY ?? "",
    zbdApiBaseUrl: options.zbdApiBaseUrl ?? process.env.ZBD_API_BASE_URL,
    fetchImpl: options.fetchImpl,
  });

  if (!adapter) {
    throw new Error("Failed to initialize ZBD MPP adapter");
  }

  const sessionStore = options.sessionStore ?? new InMemoryMppSessionStore();
  const resolveKey =
    options.keyForContext ??
    ((challenge: MppPaymentChallenge, context?: PaymentContext) =>
      context?.url ?? `${challenge.challenge.realm}:${challenge.challenge.intent}`);

  return async (
    challenge: MppPaymentChallenge,
    context?: PaymentContext,
  ): Promise<MppPaidChallenge> => {
    if (challenge.challenge.intent === "charge") {
      const paid = await payLightningChargeChallenge({
        challenge: challenge.challenge,
        adapter,
        source: options.source,
      });

      return {
        authorization: `Payment ${paid.authorization}`,
      };
    }

    const key = resolveKey(challenge, context);
    const existing = await sessionStore.get(key);
    if (existing) {
      return {
        authorization: `Payment ${createLightningSessionBearerAuthorization({
          challenge: challenge.challenge,
          session: existing,
          source: options.source,
        })}`,
      };
    }

    const session = await openLightningSession({
      challenge: challenge.challenge,
      adapter,
      source: options.source,
      returnInvoice: options.returnInvoice,
      returnLightningAddress: options.returnLightningAddress,
    });
    await sessionStore.set(key, session);

    return {
      authorization: `Payment ${session.authorization}`,
    };
  };
}
