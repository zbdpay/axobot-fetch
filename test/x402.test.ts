import { afterEach, describe, expect, it, vi } from "vitest";

import { agentFetch, requestChallenge, zbdPayX402 } from "../src/index.js";
import { startMockServer } from "./fixtures/mock-fetch.js";

afterEach(() => {
  delete process.env.ZBD_API_KEY;
  delete process.env.ZBD_AI_BASE_URL;
});

describe("x402 support", () => {
  it("parses x402 challenges from the response body", () => {
    const challenge = requestChallenge({
      status: 402,
      headers: new Headers(),
      bodyText: JSON.stringify({
        x402Version: 1,
        accepts: [
          {
            scheme: "exact",
            network: "base",
            maxAmountRequired: "21",
            resource: "https://example.com/premium",
            payTo: "0xabc",
            asset: "usdc",
            maxTimeoutSeconds: 30,
            extra: {
              amountSats: 21,
            },
          },
        ],
      }),
    });

    expect(challenge.scheme).toBe("x402");
    expect(challenge.paymentRequirement.resource).toBe("https://example.com/premium");
    expect(challenge.paymentRequirement.extra).toEqual({ amountSats: 21 });
  });

  it("uses the x402 payment hook and X-PAYMENT header", async () => {
    const server = await startMockServer({
      "GET /premium": async (request) => {
        const payment = request.headers.get("X-PAYMENT");

        if (!payment) {
          return new Response(
            JSON.stringify({
              x402Version: 1,
              accepts: [
                {
                  scheme: "exact",
                  network: "base",
                  maxAmountRequired: "21",
                  resource: "https://mock.axo.test/premium",
                  payTo: "0xabc",
                  asset: "usdc",
                  maxTimeoutSeconds: 30,
                  extra: {
                    amountSats: 21,
                  },
                },
              ],
            }),
            {
              status: 402,
              headers: { "content-type": "application/json" },
            },
          );
        }

        return new Response(JSON.stringify({ ok: true, payment }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });

    const payX402 = vi.fn(async () => ({ paymentPayload: "x402-payload" }));

    const response = await agentFetch(`${server.url}/premium`, {
      fetchImpl: server.fetch,
      pay: async () => {
        throw new Error("pay should not be used for x402");
      },
      payX402,
    });

    expect(response.status).toBe(200);
    expect(payX402).toHaveBeenCalledTimes(1);
    expect(await response.json()).toEqual({ ok: true, payment: "x402-payload" });
  });

  it("rejects x402 challenges when the payment hook is missing", async () => {
    const server = await startMockServer({
      "GET /premium": async () =>
        new Response(
          JSON.stringify({
            x402Version: 1,
            accepts: [
              {
                scheme: "exact",
                network: "base",
                maxAmountRequired: "21",
                resource: "https://mock.axo.test/premium",
                payTo: "0xabc",
                asset: "usdc",
                maxTimeoutSeconds: 30,
                extra: {
                  amountSats: 21,
                },
              },
            ],
          }),
          {
            status: 402,
            headers: { "content-type": "application/json" },
          },
        ),
    });

    await expect(
      agentFetch(`${server.url}/premium`, {
        fetchImpl: server.fetch,
        pay: async () => ({ preimage: "never" }),
      }),
    ).rejects.toThrow("x402 payment required but no payX402 hook provided");
  });

  it("guards x402 payments using the configured max sats threshold", async () => {
    const server = await startMockServer({
      "GET /premium": async () =>
        new Response(
          JSON.stringify({
            x402Version: 1,
            accepts: [
              {
                scheme: "exact",
                network: "base",
                maxAmountRequired: "21",
                resource: "https://mock.axo.test/premium",
                payTo: "0xabc",
                asset: "usdc",
                maxTimeoutSeconds: 30,
                extra: {
                  amountSats: 99,
                },
              },
            ],
          }),
          {
            status: 402,
            headers: { "content-type": "application/json" },
          },
        ),
    });

    await expect(
      agentFetch(`${server.url}/premium`, {
        fetchImpl: server.fetch,
        maxPaymentSats: 50,
        pay: async () => ({ preimage: "never" }),
        payX402: async () => ({ paymentPayload: "x402-payload" }),
      }),
    ).rejects.toThrow("Payment required: 99 sats exceeds limit of 50 sats");
  });

  it("posts x402 payments to the shield endpoint", async () => {
    process.env.ZBD_API_KEY = "api-key";
    process.env.ZBD_AI_BASE_URL = "https://shield.axo.test";

    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe("https://shield.axo.test/api/shield/x402");
      expect(JSON.parse(String(init?.body))).toEqual({
        paymentRequirement: {
          scheme: "exact",
          network: "base",
          maxAmountRequired: "21",
          resource: "https://mock.axo.test/premium",
          payTo: "0xabc",
          asset: "usdc",
          maxTimeoutSeconds: 30,
          extra: {
            amountSats: 21,
          },
        },
        idempotency_key: "agent-fetch-x402-1",
      });

      return new Response(
        JSON.stringify({
          paymentPayload: "x402-payload",
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    });

    const payX402 = zbdPayX402({
      apiKey: "api-key",
      zbdAiBaseUrl: "https://shield.axo.test",
      fetchImpl,
      idempotencyKeyFactory: () => "agent-fetch-x402-1",
    });

    const result = await payX402({
      scheme: "x402",
      paymentRequirement: {
        scheme: "exact",
        network: "base",
        maxAmountRequired: "21",
        resource: "https://mock.axo.test/premium",
        payTo: "0xabc",
        asset: "usdc",
        maxTimeoutSeconds: 30,
        extra: {
          amountSats: 21,
        },
      },
    });

    expect(result).toEqual({ paymentPayload: "x402-payload" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
