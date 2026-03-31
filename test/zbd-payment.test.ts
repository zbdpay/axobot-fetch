import { afterEach, describe, expect, it, vi } from "vitest";

import type { PaymentChallenge } from "../src/types.js";
import { zbdPayL402Invoice } from "../src/zbd-payment.js";

const challenge: PaymentChallenge = {
  scheme: "L402",
  macaroon: "m",
  invoice: "lnbc1mock",
  paymentHash: "h",
  amountSats: 21,
};

afterEach(() => {
  delete process.env.ZBD_SHIELD_ENABLED;
  delete process.env.AXO_BASE_URL;
  delete process.env.ZBD_API_KEY;
});

describe("zbdPayL402Invoice", () => {
  it("sends shield payload with invoice amount url and idempotency key", async () => {
    process.env.ZBD_API_KEY = "api-key";
    process.env.AXO_BASE_URL = "https://zbd-ai.local";

    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({
          preimage: "pre",
          payment_id: "pay-1",
          amount_sats: 21,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });

    const paid = await zbdPayL402Invoice(challenge, { url: "https://service.local/protected" }, {
      fetchImpl,
      idempotencyKeyFactory: () => "idem-1",
    });

    expect(paid.preimage).toBe("pre");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe("https://zbd-ai.local/api/shield/l402");
    expect(JSON.parse(String(init?.body))).toEqual({
      invoice: "lnbc1mock",
      amount_sats: 21,
      url: "https://service.local/protected",
      idempotency_key: "idem-1",
    });
  });

  it("throws descriptive allowance error on shield 403", async () => {
    process.env.ZBD_API_KEY = "api-key";
    process.env.AXO_BASE_URL = "https://zbd-ai.local";

    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          reason: "budget_exhausted",
          approval_id: "appr-123",
        }),
        {
          status: 403,
          headers: { "content-type": "application/json" },
        },
      );
    });

    await expect(
      zbdPayL402Invoice(challenge, { url: "https://service.local/protected" }, { fetchImpl }),
    ).rejects.toThrow("Shield blocked L402 payment: budget_exhausted (approval_id=appr-123)");
  });

  it("throws pending approval error on shield 202", async () => {
    process.env.ZBD_API_KEY = "api-key";
    process.env.AXO_BASE_URL = "https://zbd-ai.local";

    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          approval_id: "appr-456",
          status: "pending_approval",
        }),
        {
          status: 202,
          headers: { "content-type": "application/json" },
        },
      );
    });

    await expect(
      zbdPayL402Invoice(challenge, { url: "https://service.local/protected" }, { fetchImpl }),
    ).rejects.toThrow("Shield approval pending for L402 payment (approval_id=appr-456)");
  });

  it("falls back to direct payment when shield network call fails", async () => {
    process.env.ZBD_API_KEY = "api-key";
    process.env.AXO_BASE_URL = "https://zbd-ai.local";

    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            preimage: "direct-pre",
            payment_id: "pay-direct",
            amount_sats: 21,
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      );

    const warningLogger = vi.fn();

    const paid = await zbdPayL402Invoice(challenge, { url: "https://service.local/protected" }, {
      fetchImpl,
      warningLogger,
    });

    expect(paid.preimage).toBe("direct-pre");
    expect(warningLogger).toHaveBeenCalledWith(
      "Shield unreachable for L402 payment, falling back to direct payment",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1]?.[0]).toBe("https://api.zbdpay.com/v0/payments");
  });

  it("throws shield error when shield returns 5xx", async () => {
    process.env.ZBD_API_KEY = "api-key";
    process.env.AXO_BASE_URL = "https://zbd-ai.local";

    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "shield unavailable" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      zbdPayL402Invoice(challenge, { url: "https://service.local/protected" }, { fetchImpl }),
    ).rejects.toThrow('Shield L402 payment failed: 503 {"error":"shield unavailable"}');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://zbd-ai.local/api/shield/l402");
  });
});
