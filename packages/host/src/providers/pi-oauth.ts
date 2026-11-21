import { builtinProviders } from "@earendil-works/pi-ai/providers/all";

const CURATED_OAUTH_IDS = new Set(["anthropic", "github-copilot"]);

export interface PiOAuthProvider {
  id: string;
  name: string;
}

let cached: PiOAuthProvider[] | undefined;

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
