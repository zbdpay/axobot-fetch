import { fetchWithProof } from "../dist/index.js";

if (!process.env.PROTECTED_URL) {
  throw new Error("Missing required env var: PROTECTED_URL");
}

if (!process.env.L402_AUTHORIZATION) {
  throw new Error("Missing required env var: L402_AUTHORIZATION");
}

const run = async () => {
  const response = await fetchWithProof(
    process.env.PROTECTED_URL,
    {
      method: "GET",
    },
    process.env.L402_AUTHORIZATION,
    fetch,
  );

  const text = await response.text();
  console.log(JSON.stringify({ status: response.status, body: text }, null, 2));
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
