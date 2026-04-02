import type { PayInvoiceFunction, AdapterMetadata } from "./types.js";

// Import all adapters
import { zbdPayL402Invoice } from "./zbd-payment.js";
import { phoenixdPayInvoice } from "./phoenixd-payment.js";
import { clnPayInvoice } from "./cln-payment.js";
import { lndPayInvoice } from "./lnd-payment.js";
import { breezSparkPayInvoice } from "./breez-spark-payment.js";

export type AdapterType = "zbd" | "phoenixd" | "cln" | "lnd" | "breez-spark";

const adapterRegistry: Record<AdapterType, PayInvoiceFunction> = {
  zbd: zbdPayL402Invoice,
  phoenixd: phoenixdPayInvoice,
  cln: clnPayInvoice,
  lnd: lndPayInvoice,
  "breez-spark": breezSparkPayInvoice,
};

const adapterMetadata: Record<AdapterType, AdapterMetadata> = {
  zbd: {
    name: "ZBD",
    description: "ZBD API for Lightning payments",
    requiredEnvVars: ["ZBD_API_KEY"],
    optionalEnvVars: ["ZBD_API_BASE_URL", "ZBD_SHIELD_ENABLED"],
  },
  phoenixd: {
    name: "Phoenixd",
    description: "Phoenixd headless Lightning node",
    requiredEnvVars: ["PHOENIXD_API_PASSWORD"],
    optionalEnvVars: ["PHOENIXD_BASE_URL"],
  },
  cln: {
    name: "Core Lightning",
    description: "Core Lightning (CLN) via CLNRest",
    requiredEnvVars: ["CLN_RUNE"],
    optionalEnvVars: ["CLN_REST_URL"],
  },
  lnd: {
    name: "LND",
    description: "Lightning Network Daemon (LND) via REST API",
    requiredEnvVars: ["LND_MACAROON"],
    optionalEnvVars: ["LND_REST_URL"],
  },
  "breez-spark": {
    name: "Breez Spark",
    description: "Breez Spark SDK for nodeless Lightning",
    requiredEnvVars: ["BREEZ_SDK_API_KEY", "BREEZ_SDK_MNEMONIC"],
    optionalEnvVars: ["BREEZ_SDK_WORKING_DIR"],
  },
};

/**
 * Create a payment adapter by name
 */
export function createPaymentAdapter(type: AdapterType): PayInvoiceFunction {
  const adapter = adapterRegistry[type];
  if (!adapter) {
    throw new Error(`Unknown payment adapter: ${type}`);
  }
  return adapter;
}

/**
 * Get metadata for a payment adapter
 */
export function getAdapterMetadata(type: AdapterType): AdapterMetadata {
  return adapterMetadata[type];
}

/**
 * List all available adapter types
 */
export function listAvailableAdapters(): AdapterType[] {
  return Object.keys(adapterRegistry) as AdapterType[];
}

/**
 * Auto-detect payment adapter from environment variables
 * Returns the first adapter with all required env vars present
 */
export function detectPaymentAdapter(): PayInvoiceFunction {
  const detectionOrder: AdapterType[] = [
    "zbd",
    "phoenixd",
    "cln",
    "lnd",
    "breez-spark",
  ];

  for (const type of detectionOrder) {
    const metadata = adapterMetadata[type];
    const hasAllRequired = metadata.requiredEnvVars.every(
      (varName) => process.env[varName] && process.env[varName].length > 0
    );
    
    if (hasAllRequired) {
      return adapterRegistry[type];
    }
  }

  throw new Error(
    "No payment adapter configured. " +
    "Set one of: ZBD_API_KEY, PHOENIXD_API_PASSWORD, CLN_RUNE, LND_MACAROON, " +
    "or BREEZ_SDK_API_KEY + BREEZ_SDK_MNEMONIC"
  );
}

/**
 * Check which adapter would be auto-detected (without throwing)
 */
export function detectAdapterType(): AdapterType | null {
  const detectionOrder: AdapterType[] = [
    "zbd",
    "phoenixd",
    "cln",
    "lnd",
    "breez-spark",
  ];

  for (const type of detectionOrder) {
    const metadata = adapterMetadata[type];
    const hasAllRequired = metadata.requiredEnvVars.every(
      (varName) => process.env[varName] && process.env[varName].length > 0
    );
    
    if (hasAllRequired) {
      return type;
    }
  }

  return null;
}
