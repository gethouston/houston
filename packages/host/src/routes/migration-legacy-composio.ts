import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Account-level integrations of the LEGACY desktop app, for the migration
 * wizard's reconnect checklist (HOU-719). The Rust app connected apps through
 * the user's own Composio consumer account ("Composio for You"): the
 * credential persists at `~/.composio/user_data.json` and outlives the app
 * upgrade, so the migration source host can list the connected toolkits with
 * the same two REST calls the old engine made (houston-composio/cli.rs).
 *
 * Strictly best-effort and read-only: any failure (no file, expired key,
 * offline, API change) yields `[]` — the wizard then simply skips the
 * reconnect step. Only toolkit SLUGS ever leave this module; the API key is
 * read, used against Composio, and forgotten. Nothing here is uploaded.
 */

const DEFAULT_BASE_URL = "https://backend.composio.dev";
/** Per-request budget. The scan runs alongside the manifest walk; a slow or
 *  dead Composio must never hold the wizard's offer screen hostage. */
const REQUEST_TIMEOUT_MS = 8_000;

export interface LegacyComposioConfig {
  apiKey: string;
  baseUrl: string;
  orgId: string;
}

/** Parse `~/.composio/user_data.json` content. Null when unusable. */
export function parseLegacyComposioConfig(
  content: string,
): LegacyComposioConfig | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  const apiKey = typeof record.api_key === "string" ? record.api_key : "";
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl:
      typeof record.base_url === "string" && record.base_url
        ? record.base_url.replace(/\/+$/, "")
        : DEFAULT_BASE_URL,
    orgId: typeof record.org_id === "string" ? record.org_id : "",
  };
}

/** Slug hygiene, mirroring the Rust engine's normalize_toolkit_slugs. */
export function normalizeToolkitSlugs(slugs: unknown): string[] {
  if (!Array.isArray(slugs)) return [];
  const cleaned = slugs
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  return [...new Set(cleaned)].sort();
}

export interface LegacyComposioDeps {
  readTextFile?: (path: string) => Promise<string>;
  fetchFn?: typeof fetch;
  homeDir?: () => string;
}

/**
 * The legacy consumer account's connected toolkit slugs, `[]` on any failure.
 * Two calls, ported verbatim from the Rust engine: resolve the consumer
 * project, then list its connected toolkits.
 */
export async function legacyConnectedToolkits(
  deps: LegacyComposioDeps = {},
): Promise<string[]> {
  const read = deps.readTextFile ?? ((p: string) => readFile(p, "utf8"));
  const fetchFn = deps.fetchFn ?? fetch;
  const home = (deps.homeDir ?? homedir)();
  try {
    const raw = await read(join(home, ".composio", "user_data.json"));
    const config = parseLegacyComposioConfig(raw);
    if (!config) return [];
    const headers = {
      "x-user-api-key": config.apiKey,
      "x-org-id": config.orgId,
      Accept: "application/json",
    };

    const resolveRes = await fetchFn(
      `${config.baseUrl}/api/v3/org/consumer/project/resolve`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    if (!resolveRes.ok) return [];
    const resolved = (await resolveRes.json()) as {
      consumer_user_id?: string;
    };
    if (!resolved.consumer_user_id) return [];

    const listRes = await fetchFn(
      `${config.baseUrl}/api/v3/org/consumer/connected_toolkits?user_id=${encodeURIComponent(resolved.consumer_user_id)}`,
      { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
    );
    if (!listRes.ok) return [];
    const body = (await listRes.json()) as { toolkits?: unknown };
    return normalizeToolkitSlugs(body.toolkits);
  } catch (err) {
    // Best-effort by contract: an unreadable file or a dead API reads as "no
    // legacy account". Logged so a cohort-wide breakage is still visible.
    console.warn(
      "[migration] legacy Composio toolkit scan skipped:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}
