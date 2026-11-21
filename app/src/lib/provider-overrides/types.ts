import type { EffortLevel } from "../providers/types.ts";

export interface ModelOverride {
  description?: string;
  effortLevels?: readonly EffortLevel[];
}

export interface ProviderOverride {
  name?: string;
  subtitle?: string;
  description?: string;
  cost?: string;
  installUrl?: string;
  apiKeyUrl?: string;
  auth?: "oauth" | "apiKey" | "openaiCompatible";
  billing?: "subscription" | "payg";
  copilotConnect?: boolean;
  gatewayIds?: readonly string[];
  models?: Record<string, ModelOverride>;
}
