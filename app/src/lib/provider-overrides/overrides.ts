import { API_KEY_OVERRIDES } from "./overrides-api-key.ts";
import { CURATED_API_KEY_OVERRIDES } from "./overrides-api-key-curated.ts";
import { GATEWAY_OVERRIDES } from "./overrides-gateway.ts";
import { SUBSCRIPTION_OVERRIDES } from "./overrides-subscription.ts";
import type { ProviderOverride } from "./types.ts";

export const PROVIDER_OVERRIDES: Record<string, ProviderOverride> = {
  ...SUBSCRIPTION_OVERRIDES,
  ...GATEWAY_OVERRIDES,
  ...CURATED_API_KEY_OVERRIDES,
  ...API_KEY_OVERRIDES,
};
