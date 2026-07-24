import { builtinProviders } from "@earendil-works/pi-ai/providers/all";

/**
 * The pi-ai providers Houston connects via an OAuth subscription sign-in
 * (anthropic, openai-codex, github-copilot) rather than a pasted key.
 *
 * pi ≤0.80.6 had a dedicated OAuth registry (`getOAuthProviders()`) naming
 * exactly these three. Since pi 0.81 many api-key providers ALSO expose an
 * optional OAuth login (xai, kimi-coding, openrouter), so "has OAuth" no
 * longer means "connects by OAuth": Houston keeps those on the pasted-key
 * path. The rule that reproduces the old set from pi's live registry:
 * OAuth-ONLY providers (no api-key auth at all — openai-codex) plus the two
 * curated subscription providers that carry a vestigial api-key resolver
 * (anthropic, github-copilot).
 */
const CURATED_OAUTH_IDS = new Set(["anthropic", "github-copilot"]);

export interface PiOAuthProvider {
  id: string;
  /** pi's OAuth display name, e.g. "Anthropic (Claude Pro/Max)". */
  name: string;
}

let cached: PiOAuthProvider[] | undefined;

/** The OAuth (subscription sign-in) providers, with pi's display names. */
export function piOAuthProviders(): PiOAuthProvider[] {
  cached ??= builtinProviders()
    .filter(
      (p) =>
        p.auth.oauth !== undefined &&
        (!p.auth.apiKey || CURATED_OAUTH_IDS.has(p.id)),
    )
    .map((p) => ({ id: p.id, name: p.auth.oauth?.name ?? p.name }));
  return cached;
}
