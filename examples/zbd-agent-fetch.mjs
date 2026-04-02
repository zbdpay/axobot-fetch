import { FileTokenCache, axoFetch } from "../dist/index.js";

const requiredEnv = ["ZBD_API_KEY", "PROTECTED_URL"];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

const zbdApiBaseUrl = process.env.ZBD_API_BASE_URL ?? "https://api.zbdpay.com";
const maxPaymentSats = Number(process.env.MAX_PAYMENT_SATS ?? "100");
const tokenCachePath = process.env.ZBD_TOKEN_CACHE_PATH ?? `${process.env.HOME}/.zbd-wallet/token-cache.json`;

const payInvoice = async (invoice, amountSats) => {
  const response = await fetch(`${zbdApiBaseUrl}/v0/payments`, {
    method: "POST",
    headers: {
      apikey: process.env.ZBD_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      invoice,
      amount: amountSats,
    }),
  });

  const body = await response.json();
  if (!response.ok) {
    throw new Error(`Payment request failed: ${response.status} ${JSON.stringify(body)}`);
  }

  const paymentId = body?.id ?? body?.payment_id ?? body?.data?.id ?? body?.data?.payment_id;
  const preimage = body?.preimage ?? body?.data?.preimage;
  const amountPaidSats =
    body?.amount_sats ??
    body?.amountSats ??
    body?.data?.amount_sats ??
    body?.data?.amountSats ??
    amountSats;

  if (!preimage) {
    throw new Error("Payment response missing preimage. Use waitForPayment flow for async settlement.");
  }

  return {
    preimage,
    paymentId,
    amountPaidSats,
  };
};

const run = async () => {
  const url = process.env.PROTECTED_URL;
  const tokenCache = new FileTokenCache(tokenCachePath);

  const response = await axoFetch(url, {
    tokenCache,
    maxPaymentSats,
    pay: async (challenge) => {
      return payInvoice(challenge.invoice, challenge.amountSats);
    },
  });

  const text = await response.text();
  console.log(JSON.stringify({ status: response.status, body: text }, null, 2));
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
