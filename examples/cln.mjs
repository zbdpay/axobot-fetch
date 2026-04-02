import { FileTokenCache, axoFetch, clnPayInvoice } from "../dist/adapters/index.js";

/**
 * Core Lightning (CLN) Adapter Example
 * 
 * Required Environment Variables:
 * - CLN_RUNE: Your CLN rune for authentication
 * 
 * Optional Environment Variables:
 * - CLN_REST_URL: CLN REST API URL (default: https://localhost:3010)
 * 
 * Run with:
 * CLN_RUNE=<your_rune> node ./examples/cln.mjs
 * 
 * Note: CLN node must be running with CLNRest enabled and accessible.
 * For self-signed certificates, you may need to configure your fetch implementation.
 */

const requiredEnv = ["CLN_RUNE"];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

const clnRestUrl = process.env.CLN_REST_URL ?? "https://localhost:3010";
const maxPaymentSats = Number(process.env.MAX_PAYMENT_SATS ?? "100");
const tokenCachePath = process.env.CLN_TOKEN_CACHE_PATH ?? `${process.env.HOME}/.axo/cln-cache.json`;

const run = async () => {
  const url = "https://www.l402apps.com/api/apis"; // 10 sats
  const tokenCache = new FileTokenCache(tokenCachePath);

  const response = await axoFetch(url, {
    tokenCache,
    maxPaymentSats,
    pay: (challenge, context) =>
      clnPayInvoice(challenge, context, {
        rune: process.env.CLN_RUNE,
        baseUrl: clnRestUrl,
      }),
  });

  const data = await response.json();
  console.log(JSON.stringify({ status: response.status, count: data.length }, null, 2));
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
