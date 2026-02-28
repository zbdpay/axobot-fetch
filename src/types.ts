export type ChallengeScheme = "L402" | "LSAT";

export interface PaymentChallenge {
  scheme: ChallengeScheme;
  macaroon: string;
  invoice: string;
  paymentHash: string;
  amountSats: number;
  expiresAt?: number;
}

export interface PaidChallenge {
  preimage: string;
  amountPaidSats?: number;
  paymentId?: string;
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
  waitForPayment?: (paymentId: string) => Promise<PaymentSettlement>;
}
