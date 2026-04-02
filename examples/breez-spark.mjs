import { FileTokenCache, axoFetch, breezSparkPayInvoice } from "../dist/adapters/index.js";

/**
 * Breez Spark Adapter Example
 * 
 * Required Environment Variables:
 * - BREEZ_SDK_API_KEY: Your Breez SDK API key
 * - BREEZ_SDK_MNEMONIC: Your wallet mnemonic/seed phrase
 * 
 * Optional Environment Variables:
 * - BREEZ_SDK_WORKING_DIR: SDK working directory for storing node data
 * 
 * Run with:
 * BREEZ_SDK_API_KEY=<your_key> BREEZ_SDK_MNEMONIC=<your_mnemonic> node ./examples/breez-spark.mjs
 * 
 * Note: This adapter requires the @breeztech/breez-sdk-spark package to be installed.
 * The SDK will initialize on first use and connect to the Breez network.
 */

const requiredEnv = ["BREEZ_SDK_API_KEY", "BREEZ_SDK_MNEMONIC"];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

const maxPaymentSats = Number(process.env.MAX_PAYMENT_SATS ?? "100");
const tokenCachePath = process.env.BREEZ_TOKEN_CACHE_PATH ?? `${process.env.HOME}/.axo/breez-cache.json`;

const run = async () => {
  const url = "https://www.l402apps.com/api/apis"; // 10 sats
  const tokenCache = new FileTokenCache(tokenCachePath);

  const response = await axoFetch(url, {
    tokenCache,
    maxPaymentSats,
    pay: (challenge, context) =>
      breezSparkPayInvoice(challenge, context, {
        apiKey: process.env.BREEZ_SDK_API_KEY,
        mnemonic: process.env.BREEZ_SDK_MNEMONIC,
        workingDir: process.env.BREEZ_SDK_WORKING_DIR,
      }),
  });

  const data = await response.json();
  console.log(JSON.stringify({ status: response.status, count: data.length }, null, 2));
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
