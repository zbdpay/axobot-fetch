import { FileTokenCache, axoFetch, zbdPayL402Invoice } from "../dist/index.js";

/**
 * ZBD Adapter Example
 * 
 * Required Environment Variables:
 * - ZBD_API_KEY: Your ZBD API key
 * 
 * Optional Environment Variables:
 * - ZBD_API_BASE_URL: ZBD API base URL (default: https://api.zbdpay.com)
 * - ZBD_SHIELD_ENABLED: Enable Axo Shield mode (default: false)
 * - AXO_BASE_URL: Axo Shield base URL (auto-enables shield mode if set)
 * 
 * Run with:
 * ZBD_API_KEY=<your_key> node ./examples/zbd.mjs
 */

const requiredEnv = ["ZBD_API_KEY"];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

const zbdApiBaseUrl = process.env.ZBD_API_BASE_URL ?? "https://api.zbdpay.com";
const maxPaymentSats = Number(process.env.MAX_PAYMENT_SATS ?? "100");
const tokenCachePath = process.env.ZBD_TOKEN_CACHE_PATH ?? `${process.env.HOME}/.axo/zbd-cache.json`;

const run = async () => {
  const url = "https://www.l402apps.com/api/apis"; // 10 sats
  const tokenCache = new FileTokenCache(tokenCachePath);

  const response = await axoFetch(url, {
    tokenCache,
    maxPaymentSats,
    pay: (challenge, context) =>
      zbdPayL402Invoice(challenge, context, {
        apiKey: process.env.ZBD_API_KEY,
        zbdApiBaseUrl,
      }),
  });

  const data = await response.json();
  console.log(JSON.stringify({ status: response.status, count: data.length }, null, 2));
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
