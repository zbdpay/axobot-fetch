import { FileTokenCache, axoFetch, phoenixdPayInvoice } from "../dist/adapters/index.js";

/**
 * Phoenixd Adapter Example
 * 
 * Required Environment Variables:
 * - PHOENIXD_API_PASSWORD: Your Phoenixd API password
 * 
 * Optional Environment Variables:
 * - PHOENIXD_BASE_URL: Phoenixd API base URL (default: http://localhost:9740)
 * 
 * Run with:
 * PHOENIXD_API_PASSWORD=<your_password> node ./examples/phoenixd.mjs
 * 
 * Note: Phoenixd must be running and accessible at the configured base URL.
 */

const requiredEnv = ["PHOENIXD_API_PASSWORD"];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

const phoenixdBaseUrl = process.env.PHOENIXD_BASE_URL ?? "http://localhost:9740";
const maxPaymentSats = Number(process.env.MAX_PAYMENT_SATS ?? "100");
const tokenCachePath = process.env.PHOENIXD_TOKEN_CACHE_PATH ?? `${process.env.HOME}/.axo/phoenixd-cache.json`;

const run = async () => {
  const url = "https://www.l402apps.com/api/apis"; // 10 sats
  const tokenCache = new FileTokenCache(tokenCachePath);

  const response = await axoFetch(url, {
    tokenCache,
    maxPaymentSats,
    pay: (challenge, context) =>
      phoenixdPayInvoice(challenge, context, {
        password: process.env.PHOENIXD_API_PASSWORD,
        baseUrl: phoenixdBaseUrl,
      }),
  });

  const data = await response.json();
  console.log(JSON.stringify({ status: response.status, count: data.length }, null, 2));
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
