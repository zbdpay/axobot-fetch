import type { PaymentChallengeContext } from "@axobot/mppx";

export type ChallengeScheme = "L402" | "LSAT" | "x402" | "MPP";

export interface PaymentChallenge {
  scheme: "L402" | "LSAT";
  macaroon: string;
  invoice: string;
  paymentHash: string;
  amountSats: number;
  expiresAt?: number;
}

export interface X402PaymentChallenge {
  scheme: "x402";
  paymentRequirement: {
    scheme: string;
    network: string;
    maxAmountRequired: string;
    resource: string;
    payTo: string;
    asset: string;
    maxTimeoutSeconds: number;
    extra?: Record<string, unknown>;
  };
}

export interface MppPaymentChallenge {
  scheme: "MPP";
  challenge: PaymentChallengeContext;
}

export type AnyPaymentChallenge =
  | PaymentChallenge
  | X402PaymentChallenge
  | MppPaymentChallenge;

export interface PaidChallenge {
  preimage: string;
  amountPaidSats?: number;
  paymentId?: string;
}

export interface X402PaidChallenge {
  paymentPayload: string;
}

export interface MppPaidChallenge {
  authorization: string;
}

export interface PaymentSettlement {
  status: "pending" | "completed" | "failed";
  preimage?: string;
  amountPaidSats?: number;
  paymentId?: string;
  failureReason?: string;
}

export interface TokenRecord {
  authorization: string;
  expiresAt?: number;
}

export interface TokenCache {
  get(url: string): Promise<TokenRecord | null>;
  set(url: string, token: TokenRecord): Promise<void>;
  delete(url: string): Promise<void>;
}

export interface PaymentContext {
  url: string;
}

export interface AgentFetchOptions {
  fetchImpl?: typeof fetch;
  tokenCache?: TokenCache;
  requestInit?: RequestInit;
  maxPaymentSats?: number;
  paymentTimeoutMs?: number;
  paymentPollIntervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  pay: (challenge: PaymentChallenge, context?: PaymentContext) => Promise<PaidChallenge>;
  payX402?: (
    challenge: X402PaymentChallenge,
    context?: PaymentContext,
  ) => Promise<X402PaidChallenge>;
  payMpp?: (
    challenge: MppPaymentChallenge,
    context?: PaymentContext,
  ) => Promise<MppPaidChallenge>;
  waitForPayment?: (paymentId: string) => Promise<PaymentSettlement>;
}
