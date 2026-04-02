import { FileTokenCache, axoFetch, zbdPayL402Invoice } from "../dist/index.js";

// Example for testing against local AxoPay server
// Run this with: npm run example:local
// Requires AxoPay running on localhost:8787

const requiredEnv = ["ZBD_API_KEY"];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

const zbdApiBaseUrl = process.env.ZBD_API_BASE_URL ?? "https://api.zbdpay.com";
const tokenCachePath = process.env.ZBD_TOKEN_CACHE_PATH ?? `${process.env.HOME}/.zbd-wallet/token-cache.json`;

const run = async () => {
  const baseUrl = "http://localhost:8787";
  const tokenCache = new FileTokenCache(tokenCachePath);

  console.log("\n🧪 Testing AxoPay Local Server");
  console.log("================================\n");

  // Test 1: Basic protected endpoint (21 sats)
  console.log("🔒 Testing /protected (21 sats)...");
  try {
    const response = await axoFetch(`${baseUrl}/protected`, {
      tokenCache,
      maxPaymentSats: 21,
      pay: (challenge, context) =>
        zbdPayL402Invoice(challenge, context, {
          apiKey: process.env.ZBD_API_KEY,
          zbdApiBaseUrl,
        }),
    });
    const data = await response.json();
    console.log("✅ Success:", data);
  } catch (error) {
    console.error("❌ Failed:", error.message);
  }

  // Test 2: Premium endpoint (100 sats)
  console.log("\n💎 Testing /premium (100 sats)...");
  try {
    const response = await axoFetch(`${baseUrl}/premium`, {
      tokenCache,
      maxPaymentSats: 100,
      pay: (challenge, context) =>
        zbdPayL402Invoice(challenge, context, {
          apiKey: process.env.ZBD_API_KEY,
          zbdApiBaseUrl,
        }),
    });
    const data = await response.json();
    console.log("✅ Success:", data);
  } catch (error) {
    console.error("❌ Failed:", error.message);
  }

  // Test 3: Health check (no payment)
  console.log("\n❤️ Testing /health (no payment)...");
  try {
    const response = await fetch(`${baseUrl}/health`);
    const data = await response.json();
    console.log("✅ Success:", data);
  } catch (error) {
    console.error("❌ Failed:", error.message);
  }

  console.log("\n✨ Tests complete!");
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
