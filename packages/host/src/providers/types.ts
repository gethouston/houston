import type { ProviderId } from "@houston/protocol";

export type ProviderAuthMethod = "oauth" | "apiKey" | "openaiCompatible";

export interface HostProvider {
  id: ProviderId;
  name: string;
  auth: ProviderAuthMethod;
  /**
   * Offered on the LEGACY cloudrun per-turn path only (`turn/dispatch-providers.ts`,
   * `turn/cloud-provider.ts`). This flag does NOT gate the managed pod's catalog —
   * that serves the full pi-ai set (`providers/pi-catalog.ts`). Anthropic stays
   * off on the legacy path (ToS).
   */
  cloud: boolean;
  /**
   * Curated model ids the cloud per-turn `/providers` listing advertises. Codex
   * gets its list injected (deps.codexModels), so it's omitted here; the api-key
   * gateways carry a small curated set. The standing-runtime path ignores this —
   * it relays the runtime's own getModels()-derived list.
   */
  models?: readonly string[];
  /** Default model for the cloud listing's activeModel when settings has none. */
  defaultModel?: string;
}
