import {
  FileTokenCache,
  axoFetch,
  fetchWithProof,
  payChallenge,
  requestChallenge,
  zbdPayX402,
} from "@axobot/fetch";

const checks = [
  ["axoFetch", typeof axoFetch === "function"],
  ["requestChallenge", typeof requestChallenge === "function"],
  ["payChallenge", typeof payChallenge === "function"],
  ["fetchWithProof", typeof fetchWithProof === "function"],
  ["FileTokenCache", typeof FileTokenCache === "function"],
  ["zbdPayX402", typeof zbdPayX402 === "function"],
];

const failures = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failures.length > 0) {
  throw new Error(`Missing exports: ${failures.join(", ")}`);
}

console.log("import-smoke:ok");
