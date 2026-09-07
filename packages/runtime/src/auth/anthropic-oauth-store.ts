import { authStorage } from "./storage";

/** The pi `oauth` fields a Claude subscription credential is stored as. */
export interface AnthropicOauthEntry {
  access: string;
  /** Empty when the family's refresh is owned elsewhere (Gate #2 serve mode). */
  refresh: string;
  /** Unix epoch ms the access token expires; 0 = no expiry recorded. */
  expires: number;
}

/**
 * Persist a Claude subscription OAuth credential into the pi auth store as the
 * standard `anthropic` `oauth` entry. This is the ONE credential the SDK
 * subprocess authenticates from uniformly on macOS/Linux/Windows: read-token.ts
 * maps it to `CLAUDE_CODE_OAUTH_TOKEN`, which outranks both the materialized
 * `.credentials.json` file and the OS keychain. Both anthropic connect paths —
 * the co-located CLI login (auth/anthropic-cli-login.ts) and the desktop-pushed
 * envelope (transport/provider-routes.ts) — converge here so they store one shape.
 */
export function storeAnthropicOauth(entry: AnthropicOauthEntry): void {
  authStorage.set("anthropic", {
    type: "oauth",
    access: entry.access,
    refresh: entry.refresh,
    expires: entry.expires,
  });
}
