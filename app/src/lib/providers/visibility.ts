import type { Capabilities } from "@houston-ai/engine-client";
import { defaultModelFor } from "./build-provider.ts";
import { PROVIDERS } from "./catalog.ts";
import type { ProviderInfo } from "./types.ts";

/**
 * WHICH providers a surface shows: the picker's visible set, the connect
 * surfaces' account cards (where the two OpenCode gateways collapse into one),
 * and the gateway ids a card stands in for.
 */

/** Empty capability set used while hosted capabilities are still loading. */
export const EMPTY_PROVIDER_CAPABILITIES: Pick<
  Capabilities,
  "providers" | "openaiCompatible"
> = Object.freeze({
  providers: [],
  openaiCompatible: false,
});

/** Options common to the provider-visibility helpers. */
interface ProviderVisibilityOpts {
  newEngine: boolean;
  desktop?: boolean;
  capabilities?: Pick<Capabilities, "providers" | "openaiCompatible">;
}

/**
 * Whether to show the OpenAI-compatible (local / BYO model) provider. It runs
 * only on the new TS engine, and the host's `openaiCompatible` capability
 * decides — desktop hosts report it, and cloud/pod hosts now can too, so this is
 * no longer desktop-gated. When capabilities have loaded, an explicit `true` is
 * required. Before they load, desktop shows it optimistically (its co-located
 * host always supports it) while web/hosted stays hidden, so the option never
 * flashes on a Rust-engine or capability-less host.
 */
function showOpenaiCompatible(opts: ProviderVisibilityOpts): boolean {
  if (!opts.newEngine) return false;
  if (opts.capabilities) return opts.capabilities.openaiCompatible === true;
  return !!opts.desktop;
}

/**
 * Providers to show in connect UIs. `/v1/catalog` is the SINGLE visibility
 * source: `PROVIDERS` is hydrated from it, so it already IS this deployment's
 * runnable set (the full pi-ai catalog, ~35, on every deployment) — no
 * `capabilities.providers` re-gate is applied here (that narrower list
 * under-showed the picker). The one exclusion: the local OpenAI-compatible (BYO
 * model) provider is gated by the host's `openaiCompatible` capability (see
 * `showOpenaiCompatible`). Pass `newEngineActive()` and `osIsTauri()` from the
 * caller (they steer the local-provider gate).
 */
export function getVisibleProviders(
  opts: ProviderVisibilityOpts,
): readonly ProviderInfo[] {
  return PROVIDERS.filter((p) => {
    if (p.auth === "openaiCompatible") return showOpenaiCompatible(opts);
    return true;
  });
}

/**
 * The two OpenCode gateways — `opencode` (Zen, pay-as-you-go) and `opencode-go`
 * (Go, $10/mo subscription) — authenticate with the SAME opencode.ai key (pi
 * reads `OPENCODE_API_KEY` for both). Houston therefore presents ONE connectable
 * "OpenCode" account on the connect surfaces: the pasted key is stored under both
 * gateways (the adapter fans it out — see `credentialSiblings`), so a single
 * connect lights up both, and sign-out clears both. There is no way to tell a Go
 * subscription apart from Zen credits at connect time, and no need to — the model
 * the user picks selects the gateway, and opencode.ai enforces entitlement per
 * request (surfaced as a provider-error card).
 *
 * The chat model picker does NOT use this card: it maps `PROVIDERS` directly, so
 * Zen and Go stay separate, clearly-labelled model sections (HOU-577).
 */
const OPENCODE_ACCOUNT: ProviderInfo = {
  id: "opencode",
  name: "OpenCode",
  subtitle: "Zen models or the Go subscription, one key",
  installUrl: "https://opencode.ai/auth",
  cost: "Pay as you go, or $10 / month with Go",
  auth: "apiKey",
  apiKeyUrl: "https://opencode.ai/auth",
  gatewayIds: ["opencode", "opencode-go"],
  // Connect surfaces never render a model list; the chat picker reads the two
  // real catalog entries (opencode / opencode-go) for its Zen + Go sections.
  models: [],
  // The Zen gateway's default: the merged card connects both, and Zen is the
  // gateway a fresh pick lands on.
  defaultModel: defaultModelFor("opencode", []),
};

/**
 * Providers for the CONNECT surfaces (settings account list + onboarding
 * picker), where the two OpenCode gateways collapse into one "OpenCode" account
 * card. Otherwise identical to `getVisibleProviders` (same new-engine /
 * capability gating), preserving catalog order — the merged card takes
 * OpenCode's slot.
 */
export function getConnectProviders(
  opts: ProviderVisibilityOpts,
): readonly ProviderInfo[] {
  const out: ProviderInfo[] = [];
  let mergedOpenCode = false;
  for (const p of getVisibleProviders(opts)) {
    if (p.id === "opencode" || p.id === "opencode-go") {
      // Replace the first OpenCode gateway with the merged account, drop the
      // second — both are represented by the one card.
      if (!mergedOpenCode) {
        out.push(OPENCODE_ACCOUNT);
        mergedOpenCode = true;
      }
      continue;
    }
    out.push(p);
  }
  return out;
}

/**
 * The engine gateway ids a connect card maps to: its `gatewayIds` when set (the
 * merged OpenCode account → both gateways), else just its own id. Connect
 * surfaces fan their status probe / sign-out across this set.
 */
export function providerGatewayIds(p: ProviderInfo): readonly string[] {
  return p.gatewayIds ?? [p.id];
}
