import { afterEach, describe, expect, it } from "vitest";

import { encodePaymentRequest } from "@axobot/mppx";

import { axoFetch, requestChallenge, zbdPayMpp } from "../src/index.js";
import { startMockServer } from "./fixtures/mock-fetch.js";

afterEach(() => {
  delete process.env.ZBD_API_KEY;
  delete process.env.ZBD_API_BASE_URL;
});

describe("MPP support", () => {
  it("parses Payment-auth lightning charge challenges", () => {
    const request = encodePaymentRequest({
      amount: "100",
      currency: "sat",
      description: "premium access",
      methodDetails: {
        invoice: "lnbc1chargeinvoice",
        paymentHash: "11".repeat(32),
        network: "mainnet",
      },
    });

    const challenge = requestChallenge({
      status: 402,
      headers: new Headers({
        "www-authenticate": `Payment id="charge-1", realm="api.example.com", method="lightning", intent="charge", request="${request}", expires="2026-03-20T12:00:00Z"`,
      }),
    });

    expect(challenge.scheme).toBe("MPP");
    expect(challenge.challenge.intent).toBe("charge");
    expect(challenge.challenge.method).toBe("lightning");
  });

  it("uses the payMpp hook and retries with Authorization: Payment", async () => {
    const request = encodePaymentRequest({
      amount: "100",
      currency: "sat",
      description: "premium access",
      methodDetails: {
        invoice: "lnbc1chargeinvoice",
        paymentHash: "11".repeat(32),
        network: "mainnet",
      },
    });

    const server = await startMockServer({
      "GET /mpp-charge": async (incoming) => {
        if (incoming.headers.get("authorization") === "Payment mpp-proof-token") {
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        return new Response(
          JSON.stringify({ error: "payment_required" }),
          {
            status: 402,
            headers: {
              "content-type": "application/json",
              "www-authenticate": `Payment id="charge-1", realm="mock.axo.test", method="lightning", intent="charge", request="${request}", expires="2026-03-20T12:00:00Z"`,
            },
          },
        );
      },
    });

    const response = await axoFetch(`${server.url}/mpp-charge`, {
      fetchImpl: server.fetch,
      pay: async () => {
        throw new Error("L402 pay hook should not be used");
      },
      payMpp: async () => ({
        authorization: "Payment mpp-proof-token",
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("opens a lightning session through the ZBD MPP helper using returnLightningAddress", async () => {
    const request = encodePaymentRequest({
      amount: "5",
      currency: "sat",
      unitType: "token",
      methodDetails: {
        depositInvoice: "lnbc1depositinvoice",
        paymentHash: "22".repeat(32),
        depositAmount: "100",
        idleTimeout: "300",
      },
    });

    const server = await startMockServer({
      "GET /stream": async (incoming) => {
        const authorization = incoming.headers.get("authorization");
        if (authorization?.startsWith("Payment ")) {
          return new Response(JSON.stringify({ ok: true, authorization }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        return new Response(
          JSON.stringify({ error: "payment_required" }),
          {
            status: 402,
            headers: {
              "content-type": "application/json",
              "www-authenticate": `Payment id="session-1", realm="mock.axo.test", method="lightning", intent="session", request="${request}", expires="2026-03-20T12:00:00Z"`,
            },
          },
        );
      },
      "POST /v0/payments": async () =>
        new Response(
          JSON.stringify({
            data: {
              id: "pay_123",
              preimage: "33".repeat(32),
              paymentHash: "44".repeat(32),
              amount_sats: 100,
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    });

    const payMpp = zbdPayMpp({
      apiKey: "api-key",
      zbdApiBaseUrl: server.url,
      fetchImpl: server.fetch,
      returnLightningAddress: "agent@axo.bot",
    });

    const response = await axoFetch(`${server.url}/stream`, {
      fetchImpl: server.fetch,
      pay: async () => {
        throw new Error("L402 pay hook should not be used");
      },
      payMpp,
    });

    expect(response.status).toBe(200);
    expect(server.hits["POST /v0/payments"]).toBe(1);
    expect(server.hits["POST /v0/charges"] ?? 0).toBe(0);
  });

  it("tops up an existing lightning session when the server signals insufficient balance", async () => {
    const initialRequest = encodePaymentRequest({
      amount: "5",
      currency: "sat",
      unitType: "token",
      methodDetails: {
        depositInvoice: "lnbc1depositinvoice",
        paymentHash: "22".repeat(32),
        depositAmount: "100",
        idleTimeout: "300",
      },
    });

    const topUpRequest = encodePaymentRequest({
      amount: "5",
      currency: "sat",
      unitType: "token",
      methodDetails: {
        depositInvoice: "lnbc1topupinvoice",
        paymentHash: "55".repeat(32),
        depositAmount: "100",
        idleTimeout: "300",
      },
    });

    const server = await startMockServer({
      "POST /v0/payments": async () =>
        new Response(
          JSON.stringify({
            data: {
              id: "pay_123",
              preimage: "33".repeat(32),
              paymentHash: "44".repeat(32),
              amount_sats: 100,
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    });

    const payMpp = zbdPayMpp({
      apiKey: "api-key",
      zbdApiBaseUrl: server.url,
      fetchImpl: server.fetch,
      returnLightningAddress: "agent@axo.bot",
    });

    const initialChallenge = requestChallenge({
      status: 402,
      headers: new Headers({
        "www-authenticate": `Payment id="session-1", realm="mock.axo.test", method="lightning", intent="session", request="${initialRequest}", expires="2026-03-20T12:00:00Z"`,
      }),
      bodyText: JSON.stringify({
        paymentChallenge: {
          id: "session-1",
        },
        depositInvoice: "lnbc1depositinvoice",
        paymentHash: "22".repeat(32),
        amountSats: 5,
        depositSats: 100,
        reason: "new_session",
      }),
    });

    const opened = await payMpp(initialChallenge, {
      url: `${server.url}/stream`,
    });

    expect(opened.authorization.startsWith("Payment ")).toBe(true);

    const topUpChallenge = requestChallenge({
      status: 402,
      headers: new Headers({
        "www-authenticate": `Payment id="session-2", realm="mock.axo.test", method="lightning", intent="session", request="${topUpRequest}", expires="2026-03-20T12:00:00Z"`,
      }),
      bodyText: JSON.stringify({
        paymentChallenge: {
          id: "session-2",
        },
        depositInvoice: "lnbc1topupinvoice",
        paymentHash: "55".repeat(32),
        amountSats: 5,
        depositSats: 100,
        sessionId: "22".repeat(32),
        reason: "insufficient_balance",
      }),
    });

    const toppedUp = await payMpp(topUpChallenge, {
      url: `${server.url}/stream`,
    });

    expect(toppedUp.authorization.startsWith("Payment ")).toBe(true);
    expect(server.hits["POST /v0/payments"]).toBe(2);
  });
});
