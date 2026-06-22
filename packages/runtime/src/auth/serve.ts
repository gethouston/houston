import { join } from "node:path";
import { config } from "../config";
import { authStorage } from "./storage";
import { PROVIDERS } from "../ai/providers";
import {
  applyServedCredential,
  readAuthFile,
  scrubRefreshTokensAt,
  type ServedCredential,
} from "./auth-file";

/**
 * Connect-once serve mode (security Gate #2: access-token-only).
 *
 * The user's subscription credential lives centrally in the control plane (one
 * per workspace, refreshed there — the control plane is the ONLY holder of the
 * refresh token). Before every turn the sandbox pulls a fresh short-TTL ACCESS
 * token and writes it to auth.json with an empty refresh field, so a
 * prompt-injected agent that somehow read auth.json gets a token worth minutes,
 * not a permanent account takeover.
 *
 * The one exception is the device-code connect flow: pi's own login writes the
 * full credential (access + refresh) locally. The control plane captures it
 * into the central store immediately afterwards and then calls
 * POST /auth/scrub-refresh, which rewrites every entry with refresh="".
 *
 * Best-effort on sync: a transient control-plane blip leaves the existing
 * (still-valid) auth.json in place; a missing connection surfaces downstream as
 * the runtime's normal "No provider connected" error.
 */

const authPathFor = () => join(config.dataDir, "auth.json");

/** True when the sandbox is wired to serve a central workspace credential. */
export function serveModeOn(): boolean {
  return !!config.controlPlaneUrl && !!config.sandboxToken;
}

/** Config-bound scrub used by POST /auth/scrub-refresh. */
export function scrubRefreshTokens(): string[] {
  const scrubbed = scrubRefreshTokensAt(authPathFor());
  if (scrubbed.length) authStorage.reload();
  return scrubbed;
}

/**
 * Pull the workspace's central credentials from the control plane into auth.json
 * (access token / API key only). A workspace can have one credential per provider
 * (e.g. Codex AND OpenCode), so this syncs EVERY known provider and applies each
 * that the host serves — hydrating a fresh or just-woken runtime no matter which
 * provider the next turn uses. Returns the providers that were applied; an empty
 * result means the workspace hasn't connected anything yet.
 */
export async function syncServedCredential(): Promise<string[]> {
  if (!serveModeOn()) return [];
  const applied: string[] = [];
  for (const p of PROVIDERS) {
    const res = await fetch(`${config.controlPlaneUrl}/sandbox/credential?provider=${p.id}`, {
      headers: { Authorization: `Bearer ${config.sandboxToken}` },
    });
    if (res.status === 404) continue; // this provider isn't connected
    if (!res.ok) {
      // Internal serve hiccup for ONE provider must not strand the others; the
      // turn still surfaces "No provider connected" downstream if nothing applied.
      console.error(
        `[serve] credential ${p.id} (${res.status}): ${await res.text().catch(() => "")}`,
      );
      continue;
    }
    applyServedCredential(authPathFor(), (await res.json()) as ServedCredential);
    applied.push(p.id);
  }
  // pi's AuthStorage caches auth.json in memory at startup; a direct write is
  // invisible to hasAuth()/resolveModel() until we re-read it. This is the line
  // that makes a never-connected agent actually see the served credential.
  if (applied.length) authStorage.reload();
  return applied;
}

/**
 * Export the locally-held credential so the control plane can capture it into
 * the workspace's central store right after a device-code connect. Returns the
 * first connected provider's tokens, or null if nothing is connected (which is
 * also the post-scrub state — capture must run before scrub).
 */
export function exportCredential(): {
  provider: string;
  access: string;
  refresh: string;
  expires: number;
  accountId?: string;
} | null {
  for (const [provider, c] of Object.entries(readAuthFile(authPathFor()))) {
    // Only OAuth credentials are captured centrally via export; an API key is
    // submitted straight to the host, never round-tripped through the runtime.
    if (c?.type === "oauth" && c.access && c.refresh) {
      return { provider, access: c.access, refresh: c.refresh, expires: c.expires, accountId: c.accountId };
    }
  }
  return null;
}
