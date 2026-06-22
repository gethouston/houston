import { join } from "node:path";
import { PROVIDERS } from "../ai/providers";
import { config } from "../config";
import {
  applyServedCredential,
  readAuthFile,
  type ServedCredential,
  scrubRefreshTokensAt,
} from "./auth-file";
import { authStorage } from "./storage";

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

/** Pull one provider's central credential into auth.json. Null when not connected. */
async function syncOne(provider: string): Promise<string | null> {
  const res = await fetch(
    `${config.controlPlaneUrl}/sandbox/credential?provider=${encodeURIComponent(provider)}`,
    { headers: { Authorization: `Bearer ${config.sandboxToken}` } },
  );
  if (res.status === 404) return null; // this provider isn't connected for the workspace
  if (!res.ok) {
    throw new Error(
      `serve credential failed (${res.status}): ${await res.text().catch(() => "")}`,
    );
  }
  const c = (await res.json()) as ServedCredential;
  applyServedCredential(authPathFor(), c);
  return c.provider;
}

/**
 * Pull the workspace's central credentials from the control plane and write them
 * to auth.json (access token only for OAuth; the key for api-key providers). All
 * connectable providers are synced — a workspace may have several connected
 * (e.g. Claude + an OpenRouter key) and any agent can use any of them. Returns
 * the providers actually served, or [] when nothing is connected (caller falls
 * back to whatever is already in auth.json).
 */
export async function syncServedCredential(): Promise<string[]> {
  if (!serveModeOn()) return [];
  const served = await Promise.all(PROVIDERS.map((p) => syncOne(p.id)));
  const ok = served.filter((p): p is string => p !== null);
  // pi's AuthStorage caches auth.json in memory at startup; a direct write is
  // invisible to hasAuth()/resolveModel() until we re-read it. This is the line
  // that makes a never-connected agent actually see the served credential.
  if (ok.length) authStorage.reload();
  return ok;
}

/**
 * A credential the runtime hands the control plane to capture into the
 * workspace's central store right after a connect. OAuth carries the refreshable
 * token; api-key carries the raw key.
 */
export type ExportedCredential =
  | {
      provider: string;
      kind: "oauth";
      access: string;
      refresh: string;
      expires: number;
      accountId?: string;
    }
  | { provider: string; kind: "api_key"; key: string };

/** True once a credential is connected and capturable (not a scrubbed shell). */
function capturable(c: import("./auth-file").PiCred): boolean {
  return c.type === "api_key" ? !!c.key : !!c.access && !!c.refresh;
}

function toExported(
  provider: string,
  c: import("./auth-file").PiCred,
): ExportedCredential {
  return c.type === "api_key"
    ? { provider, kind: "api_key", key: c.key }
    : {
        provider,
        kind: "oauth",
        access: c.access,
        refresh: c.refresh,
        expires: c.expires,
        accountId: c.accountId,
      };
}

/**
 * Export the locally-held credential so the control plane can capture it. With
 * `only` set, exports exactly that provider (used right after connecting it);
 * otherwise the first connected provider. Returns null when nothing matching is
 * connected (also the post-scrub state — capture must run before scrub).
 */
export function exportCredential(only?: string): ExportedCredential | null {
  const auth = readAuthFile(authPathFor());
  if (only) {
    const c = auth[only];
    return c && capturable(c) ? toExported(only, c) : null;
  }
  for (const [provider, c] of Object.entries(auth)) {
    if (capturable(c)) return toExported(provider, c);
  }
  return null;
}
