import {
  FileTokenCache,
  agentFetch,
  fetchWithProof,
  payChallenge,
  requestChallenge,
} from "@axobot/fetch";

const checks = [
  ["agentFetch", typeof agentFetch === "function"],
  ["requestChallenge", typeof requestChallenge === "function"],
  ["payChallenge", typeof payChallenge === "function"],
  ["fetchWithProof", typeof fetchWithProof === "function"],
  ["FileTokenCache", typeof FileTokenCache === "function"],
];

const failures = checks.filter(([, ok]) => !ok).map(([name]) => name);
if (failures.length > 0) {
  throw new Error(`Missing exports: ${failures.join(", ")}`);
}

console.log("import-smoke:ok");
