export type EffortLevel = "low" | "medium" | "high" | "xhigh";

export const EFFORT_ORDER: readonly EffortLevel[] = [
  "low",
  "medium",
  "high",
  "xhigh",
];

export const DEFAULT_EFFORT: EffortLevel = "medium";

export interface ModelOption {
  id: string;
  label: string;
  description: string;
  acceptsImages?: boolean;
  effortLevels?: readonly EffortLevel[];
  contextWindow?: number;
  contextWindowMax?: number;
}

export interface ProviderInfo {
  id: string;
  name: string;
  subtitle: string;
  installUrl: string;
  cost: string;
  models: readonly ModelOption[];
  hiddenModels?: readonly ModelOption[];
  defaultModel: string;
  auth?: "oauth" | "apiKey" | "openaiCompatible";
  apiKeyUrl?: string;
  copilotConnect?: boolean;
  gatewayIds?: readonly string[];
}

export interface ContextWindowConfig {
  default: number;
  max: number;
  inputLimit?: number;
}
