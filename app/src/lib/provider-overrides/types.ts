import type { EffortLevel } from "../providers/types.ts";

/**
 * The SHAPE of the Houston presentation metadata layered over pi-ai's catalog.
 * The tables themselves live in `./overrides.ts`, which documents the layer.
 */

/** Per-model presentation metadata pi-ai can't supply, keyed by model id. */
export interface ModelOverride {
  /** One-line picker description (pi ships none). */
  description?: string;
  /**
   * ESCAPE HATCH for a genuine gateway cap `deriveEffortLevels` can't see. By
   * default a model's effort set is derived from pi's per-model thinking levels;
   * set this ONLY when a specific gateway documents a real ceiling below what pi
   * reports (then comment the source), or `[]` to hide the effort row for a
   * model pi wrongly flags as reasoning. Do NOT use it to merely duplicate or
   * trim the derived list — that is the exact drift this catalog removed, and
   * the drift guard test rejects any id here that pi doesn't ship. None are set
   * today.
   */
  effortLevels?: readonly EffortLevel[];
}

/** Provider-level presentation metadata pi-ai can't supply, keyed by provider id. */
export interface ProviderOverride {
  /** Brand label (pi's `name` is a titleized id or an OAuth subscription string). */
  name?: string;
  subtitle?: string;
  /**
   * One-line provider description for the Providers LIST row (what the provider
   * is / its niche), rendered muted after the bold live model count. Kept short
   * (~60 chars) so it fits the compact row. Plain English, rendered directly
   * (the overrides layer is i18n-agnostic, matching `subtitle`) — NOT the longer
   * marketing copy the provider modal reads from `aiHub:providers.*.description`.
   * Every provider id resolves to one via `providerDescription`.
   */
  description?: string;
  cost?: string;
  installUrl?: string;
  /** For api-key providers: the dashboard URL where the user creates/copies the key. */
  apiKeyUrl?: string;
  /**
   * How the user connects this provider. Defaults from pi's `auth` (oauth →
   * `"oauth"`, else `"apiKey"`); pinned to `"oauth"` for the three subscription
   * providers, or `"openaiCompatible"` for the local provider.
   */
  auth?: "oauth" | "apiKey" | "openaiCompatible";
  /**
   * How this provider is BILLED, when it differs from what `auth` implies
   * (oauth → `"subscription"`, apiKey → `"payg"`). The Providers-tab filter
   * reads this (`providerBilling`), not `auth` directly — auth is how you
   * connect, this is how you pay, and they only coincide by default. The one
   * override that needs this today: OpenCode Go is a flat $10/month
   * subscription paid for with a pasted API key (`opencode-go` below).
   */
  billing?: "subscription" | "payg";
  /** GitHub Copilot's Personal-vs-Enterprise connect dialog. */
  copilotConnect?: boolean;
  /** The engine gateway ids one connect card stands in for (merged OpenCode). */
  gatewayIds?: readonly string[];
  /** Per-model presentation overrides, keyed by pi model id. */
  models?: Record<string, ModelOverride>;
}
