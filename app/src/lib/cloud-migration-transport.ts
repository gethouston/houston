/**
 * HTTP transport for the cloud-migration wizard (HOU-719).
 *
 * Two peers:
 *  - the SOURCE host — the passive sidecar `start_migration_source_host`
 *    spawned against the old `~/.houston` tree (loopback URL + static bearer);
 *  - the CLOUD GATEWAY — agent-scoped `/agents/:slug/migration/*` routes,
 *    authenticated with the live identity session token (a Firebase ID token).
 *
 * Gateway auth, build identity and the update floor are the shared
 * `./gateway-fetch` helper's job — the app-side peer of the engine adapter's
 * `gatewayAuthFetch` (HOU-687), which app code cannot import across the
 * package boundary.
 */

import type { SourceAgent } from "./cloud-migration";
import type { MigrationCounts } from "./cloud-migration-progress";
import { gatewayFetch, liveGatewayDeps } from "./gateway-fetch.ts";
import i18n from "./i18n";

export interface SourceHostHandshake {
  baseUrl: string;
  token: string;
}

/** One chunk's import outcome, as the gateway reports it. */
export interface ImportResult {
  written: number;
  skipped: number;
  rejected: Array<{ path: string; reason: string }>;
  /** Whether the pod anchored re-synthesized chat sessions on this chunk. */
  sessionsRebuilt: boolean;
}

/** The persisted "this agent was imported" marker. */
export interface MigrationMarker {
  completedAt: string;
  source: { workspace: string; agent: string };
  counts: Partial<MigrationCounts>;
}

async function throwHttpError(label: string, res: Response): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: unknown };
  const detail =
    typeof body.error === "string" && body.error
      ? body.error
      : `HTTP ${res.status}`;
  throw new Error(`${label}: ${detail}`);
}

// ── Source host (loopback) ────────────────────────────────────────────

function sourceFetch(
  src: SourceHostHandshake,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${src.baseUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${src.token}`, ...init?.headers },
  });
}

export interface SourceScan {
  agents: SourceAgent[];
  /** The legacy Composio account's connected toolkit slugs (`~/.composio`),
   *  best-effort — absent on an older source host reads as none. */
  accountIntegrations: string[];
}

/** Every legacy agent across every workspace, with its migration manifest,
 *  plus the account-level connected integrations. */
export async function fetchSourceScan(
  src: SourceHostHandshake,
): Promise<SourceScan> {
  const res = await sourceFetch(src, "/v1/migration/source");
  if (!res.ok) await throwHttpError("migration source scan", res);
  const body = (await res.json()) as {
    agents: SourceAgent[];
    accountIntegrations?: string[];
  };
  return {
    agents: body.agents,
    accountIntegrations: body.accountIntegrations ?? [],
  };
}

/** Zip the given paths of one legacy agent on the source host. */
export async function exportSourceZip(
  src: SourceHostHandshake,
  sourceAgentId: string,
  paths: string[],
): Promise<ArrayBuffer> {
  const res = await sourceFetch(
    src,
    `/agents/${encodeURIComponent(sourceAgentId)}/migration/export`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths }),
    },
  );
  if (!res.ok) await throwHttpError("migration export", res);
  return await res.arrayBuffer();
}

// ── Cloud gateway (agent-scoped, live Firebase ID-token bearer) ───────

// Both messages reach the user verbatim — the wizard's per-agent row renders
// the thrown `Error.message` (`progress-agent-row.tsx`) — so they are localized
// here rather than at a UI boundary that never reformats them. `i18n.t` (not
// the hook) is the established way a non-React lib module speaks, as in
// `provider-login-error.ts`.
async function cloudFetch(path: string, init?: RequestInit): Promise<Response> {
  const deps = liveGatewayDeps();
  if (!deps) throw new Error(i18n.t("migration:transport.notConnected"));
  const res = await gatewayFetch(deps, path, init);
  if (!res) throw new Error(i18n.t("migration:transport.signedOut"));
  return res;
}

/** Upload one raw zip chunk into a cloud agent. `overwrite` on retries so a
 *  re-sent chunk lands cleanly over a partial first attempt. */
export async function importAgentZip(
  agentId: string,
  zip: ArrayBuffer,
  opts?: { overwrite?: boolean },
): Promise<ImportResult> {
  const query = opts?.overwrite ? "?overwrite=1" : "";
  const res = await cloudFetch(
    `/agents/${encodeURIComponent(agentId)}/migration/import${query}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/zip" },
      body: zip,
    },
  );
  if (!res.ok) await throwHttpError("migration import", res);
  return (await res.json()) as ImportResult;
}

/** Stamp the import marker once every chunk of an agent has landed. */
export async function completeAgentMigration(
  agentId: string,
  source: { workspace: string; agent: string },
  counts: MigrationCounts,
): Promise<void> {
  const res = await cloudFetch(
    `/agents/${encodeURIComponent(agentId)}/migration/complete`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, counts }),
    },
  );
  if (!res.ok) await throwHttpError("migration complete", res);
}

/** An existing cloud agent's import marker, `null` when never imported. */
export async function agentMigrationStatus(
  agentId: string,
): Promise<MigrationMarker | null> {
  const res = await cloudFetch(
    `/agents/${encodeURIComponent(agentId)}/migration/status`,
  );
  // An older pod without the route reads as "never imported" — resume just
  // won't skip it, which at worst re-plans an agent under a renamed target.
  if (res.status === 404) return null;
  if (!res.ok) await throwHttpError("migration status", res);
  const body = (await res.json()) as { imported: MigrationMarker | null };
  return body.imported;
}
