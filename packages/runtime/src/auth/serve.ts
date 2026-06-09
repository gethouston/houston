import { writeFileSync, renameSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config";
import { authStorage } from "./storage";

/**
 * Connect-once serve mode.
 *
 * The user's subscription credential lives centrally in the control plane (one
 * per workspace, refreshed there). Each agent sandbox does NOT hold a refresh
 * token: before every turn it pulls a fresh access token from the control plane
 * and writes a complete auth.json, so pi authenticates the ChatGPT/Claude
 * backend with the user's own token. Every agent shares one connection, and a
 * new agent works with no extra login.
 *
 * Best-effort: a transient control-plane blip leaves the existing (still-valid)
 * auth.json in place; a missing connection surfaces downstream as the runtime's
 * normal "No provider connected" error.
 */

/** The pi auth.json entry shape per provider. */
type PiCred = { type: "oauth"; access: string; refresh: string; expires: number; accountId?: string };

const authPath = join(config.dataDir, "auth.json");

/** The local auth.json contents, or {} when absent/corrupt. */
function readAuth(): Record<string, PiCred> {
  if (!existsSync(authPath)) return {};
  try {
    return JSON.parse(readFileSync(authPath, "utf8")) as Record<string, PiCred>;
  } catch {
    return {};
  }
}

/** True when the sandbox is wired to serve a central workspace credential. */
export function serveModeOn(): boolean {
  return !!config.controlPlaneUrl && !!config.sandboxToken;
}

/**
 * Pull the workspace's central credential from the control plane and write it to
 * auth.json. Returns the provider on success, or null when the workspace isn't
 * connected yet (caller falls back to whatever is already in auth.json).
 */
export async function syncServedCredential(): Promise<string | null> {
  if (!serveModeOn()) return null;
  const res = await fetch(`${config.controlPlaneUrl}/sandbox/credential?provider=openai-codex`, {
    headers: { Authorization: `Bearer ${config.sandboxToken}` },
  });
  if (res.status === 404) return null; // workspace not connected yet
  if (!res.ok) {
    throw new Error(`serve credential failed (${res.status}): ${await res.text().catch(() => "")}`);
  }
  const c = (await res.json()) as {
    provider: string;
    access: string;
    refresh: string;
    expires: number;
    accountId: string | null;
  };
  const entry: PiCred = { type: "oauth", access: c.access, refresh: c.refresh, expires: c.expires };
  if (c.accountId) entry.accountId = c.accountId;

  const merged = readAuth();
  merged[c.provider] = entry;
  const tmp = `${authPath}.tmp`;
  writeFileSync(tmp, JSON.stringify(merged), { mode: 0o600 }); // atomic write
  renameSync(tmp, authPath);
  // pi's AuthStorage caches auth.json in memory at startup; a direct write is
  // invisible to hasAuth()/resolveModel() until we re-read it. This is the line
  // that makes a never-connected agent actually see the served credential.
  authStorage.reload();
  return c.provider;
}

/**
 * Export the locally-held credential so the control plane can capture it into the
 * workspace's central store right after a device-code connect. Returns the first
 * connected provider's tokens, or null if nothing is connected.
 */
export function exportCredential(): {
  provider: string;
  access: string;
  refresh: string;
  expires: number;
  accountId?: string;
} | null {
  for (const [provider, c] of Object.entries(readAuth())) {
    if (c?.access && c?.refresh) {
      return { provider, access: c.access, refresh: c.refresh, expires: c.expires, accountId: c.accountId };
    }
  }
  return null;
}
