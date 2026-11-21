export const CONNECT_APPS_FALLBACK = ["gmail", "outlook", "slack"] as const;

export const CONNECT_AI_FALLBACK = ["anthropic", "openai", "google"] as const;

export interface ConnectLogoPick {
  connected: readonly string[] | null;
  fallback: readonly string[];
  drawable: (id: string) => boolean;
  identity?: (id: string) => string;
  max: number;
}

export function pickConnectLogoIds(pick: ConnectLogoPick): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [...(pick.connected ?? []), ...pick.fallback]) {
    if (out.length >= pick.max) break;
    const key = pick.identity ? pick.identity(id) : id;
    if (seen.has(key) || !pick.drawable(id)) continue;
    seen.add(key);
    out.push(id);
  }
  return out;
}

export function pickConnectAppIds(pick: {
  connected: readonly string[] | null;
  knownLogo: (slug: string) => string;
  max: number;
}): string[] {
  const bundled: ReadonlySet<string> = new Set(CONNECT_APPS_FALLBACK);
  return pickConnectLogoIds({
    connected: pick.connected,
    fallback: CONNECT_APPS_FALLBACK,
    drawable: (slug) => bundled.has(slug) || pick.knownLogo(slug) !== "",
    max: pick.max,
  });
}
