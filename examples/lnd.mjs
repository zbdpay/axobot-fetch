import { FileTokenCache, axoFetch, lndPayInvoice } from "../dist/adapters/index.js";

/**
 * LND Adapter Example
 * 
 * Required Environment Variables:
 * - LND_MACAROON: Hex-encoded LND macaroon for authentication
 * 
 * Optional Environment Variables:
 * - LND_REST_URL: LND REST API URL (default: https://localhost:8080)
 * 
 * Run with:
 * LND_MACAROON=<your_macaroon> node ./examples/lnd.mjs
 * 
 * Note: LND node must be running with REST API enabled and accessible.
 * For self-signed certificates, you may need to configure your fetch implementation
 * or use environment variables to disable TLS verification (not recommended for production).
 */

const requiredEnv = ["LND_MACAROON"];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

const lndRestUrl = process.env.LND_REST_URL ?? "https://localhost:8080";
const maxPaymentSats = Number(process.env.MAX_PAYMENT_SATS ?? "100");
const tokenCachePath = process.env.LND_TOKEN_CACHE_PATH ?? `${process.env.HOME}/.axo/lnd-cache.json`;

const run = async () => {
  const url = "https://www.l402apps.com/api/apis"; // 10 sats
  const tokenCache = new FileTokenCache(tokenCachePath);

  const response = await axoFetch(url, {
    tokenCache,
    maxPaymentSats,
    pay: (challenge, context) =>
      lndPayInvoice(challenge, context, {
        macaroon: process.env.LND_MACAROON,
        baseUrl: lndRestUrl,
      }),
  });

  const data = await response.json();
  console.log(JSON.stringify({ status: response.status, count: data.length }, null, 2));
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
