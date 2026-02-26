import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
  FileTokenCache,
  agentFetch,
  fetchWithProof,
  payChallenge,
  requestChallenge,
} from "../src/index.js";
import { startMockServer } from "./fixtures/mock-server.js";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanup.length > 0) {
    const fn = cleanup.pop();
    if (fn) {
      await fn();
    }
  }
});

describe("public API foundation", () => {
  it("passes through non-402 responses without paying", async () => {
    const server = await startMockServer({
      "GET /public": (_req, res) => {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true }));
      },
    });
    cleanup.push(() => server.close());

    let payCalls = 0;
    const response = await agentFetch(`${server.url}/public`, {
      pay: async () => {
        payCalls += 1;
        return { preimage: "never" };
      },
    });

    expect(response.status).toBe(200);
    expect(payCalls).toBe(0);
    expect(server.hits["GET /public"]).toBe(1);
  });

  it("parses a 402 challenge from headers", () => {
    const headers = new Headers({
      "www-authenticate":
        'L402 macaroon="macaroon-value", invoice="invoice-value", paymentHash="hash-value", amountSats="21"',
    });

    const challenge = requestChallenge({
      status: 402,
      headers,
    });

    expect(challenge.scheme).toBe("L402");
    expect(challenge.amountSats).toBe(21);
  });

  it("parses LSAT and token alias from headers", () => {
    const headers = new Headers({
      "www-authenticate":
        'LSAT token="token-value", invoice="invoice-value", payment_hash="hash-value", amountSats="9"',
    });

    const challenge = requestChallenge({
      status: 402,
      headers,
    });

    expect(challenge.scheme).toBe("LSAT");
    expect(challenge.macaroon).toBe("token-value");
    expect(challenge.paymentHash).toBe("hash-value");
  });

  it("assembles authorization from paid challenge", () => {
    const authorization = payChallenge(
      {
        scheme: "LSAT",
        macaroon: "m",
        invoice: "i",
        paymentHash: "p",
        amountSats: 10,
      },
      {
        preimage: "pre",
      },
    );

    expect(authorization).toBe("LSAT m:pre");
  });

  it("retries 402 flow and stores proof token", async () => {
    const server = await startMockServer({
      "GET /protected": (req, res) => {
        const auth = req.headers.authorization;

        if (!auth) {
          res.statusCode = 402;
          res.setHeader("content-type", "application/json");
          res.setHeader(
            "www-authenticate",
            'L402 macaroon="mock-macaroon", invoice="lnbc1mock", paymentHash="mock-hash", amountSats="5"',
          );
          res.end(JSON.stringify({
            macaroon: "mock-macaroon",
            invoice: "lnbc1mock",
            paymentHash: "mock-hash",
            amountSats: 5,
            expiresAt: Math.floor(Date.now() / 1000) + 30,
          }));
          return;
        }

        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: true, authorization: auth }));
      },
    });
    cleanup.push(() => server.close());

    const dir = await mkdtemp(join(tmpdir(), "agent-fetch-test-"));
    cleanup.push(() => rm(dir, { recursive: true, force: true }));
    const cachePath = join(dir, "token-cache.json");
    const cache = new FileTokenCache(cachePath);

    const response = await agentFetch(`${server.url}/protected`, {
      tokenCache: cache,
      pay: async () => ({
        preimage: "mock-preimage",
        amountPaidSats: 5,
      }),
    });

    expect(response.status).toBe(200);
    expect(server.hits["GET /protected"]).toBe(2);

    const cacheContents = await readFile(cachePath, "utf8");
    expect(cacheContents).toContain("mock-preimage");

    const second = await agentFetch(`${server.url}/protected`, {
      tokenCache: cache,
      pay: async () => {
        throw new Error("pay should not be called when token cache is valid");
      },
    });
    expect(second.status).toBe(200);
    expect(server.hits["GET /protected"]).toBe(3);
  });

  it("drops stale cached token and retries payment flow", async () => {
    const server = await startMockServer({
      "GET /stale": (req, res) => {
        const auth = req.headers.authorization;
        if (auth === "L402 stale-mac:stale-pre") {
          res.statusCode = 401;
          res.end("stale");
          return;
        }

        if (!auth) {
          res.statusCode = 402;
          res.setHeader("content-type", "application/json");
          res.setHeader(
            "www-authenticate",
            'L402 macaroon="fresh-mac", invoice="lnbc1fresh", paymentHash="fresh-hash", amountSats="7"',
          );
          res.end(
            JSON.stringify({
              challenge: {
                scheme: "L402",
                macaroon: "fresh-mac",
                invoice: "lnbc1fresh",
                paymentHash: "fresh-hash",
                amountSats: 7,
              },
            }),
          );
          return;
        }

        if (auth === "L402 fresh-mac:fresh-pre") {
          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        res.statusCode = 403;
        res.end("unexpected_authorization");
      },
    });
    cleanup.push(() => server.close());

    const dir = await mkdtemp(join(tmpdir(), "agent-fetch-stale-"));
    cleanup.push(() => rm(dir, { recursive: true, force: true }));
    const cachePath = join(dir, "token-cache.json");
    const cache = new FileTokenCache(cachePath);
    await cache.set(`${server.url}/stale`, {
      authorization: "L402 stale-mac:stale-pre",
    });

    let payCalls = 0;
    const response = await agentFetch(`${server.url}/stale`, {
      tokenCache: cache,
      pay: async () => {
        payCalls += 1;
        return {
          preimage: "fresh-pre",
          amountPaidSats: 7,
        };
      },
    });

    expect(response.status).toBe(200);
    expect(payCalls).toBe(1);
    expect(server.hits["GET /stale"]).toBe(3);

    const cacheContents = await readFile(cachePath, "utf8");
    expect(cacheContents).toContain("fresh-mac:fresh-pre");
    expect(cacheContents).not.toContain("stale-mac:stale-pre");
  });

  it("evicts expired token and repays without sending stale authorization", async () => {
    const seenAuth: Array<string | null> = [];
    const server = await startMockServer({
      "GET /expires": (req, res) => {
        const auth = req.headers.authorization ?? null;
        seenAuth.push(auth);

        if (!auth) {
          res.statusCode = 402;
          res.setHeader("content-type", "application/json");
          res.setHeader(
            "www-authenticate",
            'L402 macaroon="exp-mac", invoice="lnbc1exp", paymentHash="exp-hash", amountSats="6"',
          );
          res.end(
            JSON.stringify({
              challenge: {
                scheme: "L402",
                macaroon: "exp-mac",
                invoice: "lnbc1exp",
                paymentHash: "exp-hash",
                amountSats: 6,
                expiresAt: Math.floor(Date.now() / 1000) + 120,
              },
            }),
          );
          return;
        }

        if (auth === "L402 exp-mac:exp-pre") {
          res.statusCode = 200;
          res.end("ok");
          return;
        }

        res.statusCode = 401;
        res.end("unexpected_authorization");
      },
    });
    cleanup.push(() => server.close());

    const dir = await mkdtemp(join(tmpdir(), "agent-fetch-expired-"));
    cleanup.push(() => rm(dir, { recursive: true, force: true }));
    const cachePath = join(dir, "token-cache.json");
    const cache = new FileTokenCache(cachePath);
    await cache.set(`${server.url}/expires`, {
      authorization: "L402 expired-mac:expired-pre",
      expiresAt: Math.floor(Date.now() / 1000) - 10,
    });

    let payCalls = 0;
    const response = await agentFetch(`${server.url}/expires`, {
      tokenCache: cache,
      pay: async () => {
        payCalls += 1;
        return {
          preimage: "exp-pre",
          amountPaidSats: 6,
        };
      },
    });

    expect(response.status).toBe(200);
    expect(payCalls).toBe(1);
    expect(server.hits["GET /expires"]).toBe(2);
    expect(seenAuth[0]).toBeNull();
    expect(seenAuth[1]).toBe("L402 exp-mac:exp-pre");
  });

  it("enforces maxPaymentSats before dispatching payment", async () => {
    const server = await startMockServer({
      "GET /cap": (_req, res) => {
        res.statusCode = 402;
        res.setHeader(
          "www-authenticate",
          'L402 macaroon="mock-macaroon", invoice="lnbc1mock", paymentHash="mock-hash", amountSats="8"',
        );
        res.end();
      },
    });
    cleanup.push(() => server.close());

    let payCalls = 0;

    await expect(
      agentFetch(`${server.url}/cap`, {
        maxPaymentSats: 5,
        pay: async () => {
          payCalls += 1;
          return { preimage: "never" };
        },
      }),
    ).rejects.toThrow("exceeds limit of 5 sats");

    expect(payCalls).toBe(0);
  });

  it("polls for async settlement until completed", async () => {
    const server = await startMockServer({
      "GET /async": (req, res) => {
        if (!req.headers.authorization) {
          res.statusCode = 402;
          res.setHeader(
            "www-authenticate",
            'L402 macaroon="mock-macaroon", invoice="lnbc1mock", paymentHash="mock-hash", amountSats="4"',
          );
          res.end();
          return;
        }

        res.statusCode = 200;
        res.end("ok");
      },
    });
    cleanup.push(() => server.close());

    const statuses: Array<"pending" | "completed" | "failed"> = ["pending", "completed"];
    let pollIndex = 0;

    const response = await agentFetch(`${server.url}/async`, {
      pay: async () => ({ paymentId: "pay-1", preimage: "" }),
      waitForPayment: async () => {
        const status = statuses[Math.min(pollIndex, statuses.length - 1)];
        pollIndex += 1;
        if (status === "completed") {
          return {
            status,
            paymentId: "pay-1",
            preimage: "settled-preimage",
            amountPaidSats: 4,
          };
        }
        return { status, paymentId: "pay-1" };
      },
      now: () => 0,
      sleep: async () => Promise.resolve(),
      paymentTimeoutMs: 100,
      paymentPollIntervalMs: 1,
    });

    expect(response.status).toBe(200);
    expect(pollIndex).toBe(2);
  });

  it("throws deterministic timeout when async settlement does not complete", async () => {
    const server = await startMockServer({
      "GET /timeout": (_req, res) => {
        res.statusCode = 402;
        res.setHeader(
          "www-authenticate",
          'L402 macaroon="mock-macaroon", invoice="lnbc1mock", paymentHash="mock-hash", amountSats="4"',
        );
        res.end();
      },
    });
    cleanup.push(() => server.close());

    let tick = 0;

    await expect(
      agentFetch(`${server.url}/timeout`, {
        pay: async () => ({ paymentId: "pay-timeout", preimage: "" }),
        waitForPayment: async () => ({
          status: "pending",
          paymentId: "pay-timeout",
        }),
        paymentTimeoutMs: 10,
        paymentPollIntervalMs: 1,
        now: () => tick,
        sleep: async () => {
          tick += 6;
        },
      }),
    ).rejects.toThrow("Payment pay-timeout did not settle within 10ms");
  });

  it("adds authorization via fetchWithProof", async () => {
    const seen: string[] = [];
    const fakeFetch: typeof fetch = async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const header = new Headers(init?.headers).get("authorization");
      if (header) {
        seen.push(header);
      }
      return new Response("ok", { status: 200 });
    };

    const response = await fetchWithProof(
      "https://example.invalid/protected",
      { method: "GET" },
      "L402 m:p",
      fakeFetch,
    );

    expect(response.status).toBe(200);
    expect(seen).toEqual(["L402 m:p"]);
  });
});
