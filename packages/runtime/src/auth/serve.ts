import { join } from "node:path";
import { PROVIDERS } from "../ai/providers";
import { config } from "../config";
import {
  applyServedCredential,
  type PiCred,
  readAuthFile,
  type ServedCredential,
  scrubRefreshTokensAt,
} from "./auth-file";
import { authStorage } from "./storage";

export type ExportedCredential = {
  provider: string;
  access: string;
  refresh: string;
  expires: number;
  accountId?: string;
  enterpriseUrl?: string;
};

/**
 * Pure: choose the OAuth credential to export from an auth.json record. When
 * `provider` is given, returns EXACTLY that provider (connect-once capture is
 * provider-specific — capturing a github-copilot connect must never grab a
 * different OAuth provider that comes first in the record). Without a provider,
 * returns the first connected OAuth provider. Only OAuth credentials with both
 * access + refresh are exportable (an API key is submitted to the host directly,
 * and a scrubbed entry has refresh=""). Testable without the dataDir singleton.
 */
export function selectExportCredential(
  auth: Record<string, PiCred>,
  provider?: string,
): ExportedCredential | null {
  for (const [p, c] of Object.entries(auth)) {
    if (provider && p !== provider) continue;
    if (c?.type === "oauth" && c.access && c.refresh) {
      return {
        provider: p,
        access: c.access,
        refresh: c.refresh,
        expires: c.expires,
        accountId: c.accountId,
        enterpriseUrl: c.enterpriseUrl,
      };
    }
  }
  return null;
}

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
 * (e.g. Codex AND Bedrock), so this syncs EVERY known provider and applies each
 * that the host serves — hydrating a fresh or just-woken runtime no matter which
 * provider the next turn uses. Returns the providers that were applied; an empty
 * result means the workspace hasn't connected anything yet.
 *
 * Concurrent callers SHARE one in-flight sync. GET /auth/status now hydrates too
 * (so a brand-new agent's model picker shows the workspace's connected providers
 * before its first turn — HOU-573), and the picker fires one status request PER
 * provider in parallel. Without sharing, those N requests would run N syncs that
 * each rewrite auth.json at once — a write race. A turn and a status poll can also
 * overlap. One sync, one auth.json write, every caller gets the same result.
 */
let serveSyncInFlight: Promise<string[]> | null = null;

export function syncServedCredential(): Promise<string[]> {
  if (serveSyncInFlight) return serveSyncInFlight;
  serveSyncInFlight = runServedSync().finally(() => {
    serveSyncInFlight = null;
  });
  return serveSyncInFlight;
}

async function runServedSync(): Promise<string[]> {
  if (!serveModeOn()) return [];
  const applied: string[] = [];
  for (const p of PROVIDERS) {
    const res = await fetch(
      `${config.controlPlaneUrl}/sandbox/credential?provider=${p.id}`,
      {
        headers: { Authorization: `Bearer ${config.sandboxToken}` },
      },
    );
    if (res.status === 404) continue; // this provider isn't connected
    if (!res.ok) {
      // Internal serve hiccup for ONE provider must not strand the others; the
      // turn still surfaces "No provider connected" downstream if nothing applied.
      console.error(
        `[serve] credential ${p.id} (${res.status}): ${await res.text().catch(() => "")}`,
      );
      continue;
    }
    applyServedCredential(
      authPathFor(),
      (await res.json()) as ServedCredential,
    );
    applied.push(p.id);
  }
  // pi's AuthStorage caches auth.json in memory at startup; a direct write is
  // invisible to hasAuth()/resolveModel() until we re-read it. This is the line
  // that makes a never-connected agent actually see the served credential.
  if (applied.length) authStorage.reload();
  // One-line per-turn diagnostic: which central credentials this serve applied.
  // If a connected provider is absent here (its serve 404'd), its token can't be
  // refreshed centrally — the silent-404 path that left Copilot un-served.
  console.log(
    `[serve] applied central credentials: ${applied.join(", ") || "(none)"}`,
  );
  return applied;
}

/**
 * Export the locally-held credential so the control plane can capture it into
 * the workspace's central store right after a device-code connect. When
 * `provider` is given, exports EXACTLY that provider — connect-once capture is
 * provider-specific, so capturing a github-copilot connect must never grab a
 * different OAuth provider that happens to come first in auth.json (which would
 * leave Copilot un-persisted centrally and 404 every per-turn serve). Without a
 * provider, falls back to the first connected OAuth provider. Returns null when
 * the (requested) provider isn't connected — also the post-scrub state, so
 * capture must run before scrub.
 */
export function exportCredential(provider?: string): ExportedCredential | null {
  return selectExportCredential(readAuthFile(authPathFor()), provider);
}
