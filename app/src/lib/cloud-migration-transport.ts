/**
 * HTTP transport for the cloud-migration wizard (HOU-719).
 *
 * Two peers:
 *  - the SOURCE host — the passive sidecar `start_migration_source_host`
 *    spawned against the old `~/.houston` tree (loopback URL + static bearer);
 *  - the CLOUD GATEWAY — agent-scoped `/agents/:slug/migration/*` routes,
 *    authenticated with the live Supabase session token.
 *
 * Gateway auth mirrors the engine adapter's `gatewayAuthFetch` (HOU-687): the
 * bearer is read LIVE from `window.__HOUSTON_ENGINE__` per attempt, and a 401
 * triggers one session refresh via `window.__HOUSTON_SESSION_REFRESH__` and
 * one replay. (The adapter's own helper isn't importable from app code — the
 * real `@houston-ai/engine-client` package types don't export it — so this
 * module speaks the same two globals `lib/engine.ts` declares and maintains.)
 */

import type { SourceAgent } from "./cloud-migration";
import type { MigrationCounts } from "./cloud-migration-progress";

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

/** Every legacy agent across every workspace, with its migration manifest. */
export async function fetchSourceAgents(
  src: SourceHostHandshake,
): Promise<SourceAgent[]> {
  const res = await sourceFetch(src, "/v1/migration/source");
  if (!res.ok) await throwHttpError("migration source scan", res);
  const body = (await res.json()) as { agents: SourceAgent[] };
  return body.agents;
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

// ── Cloud gateway (agent-scoped, live Supabase bearer) ────────────────

function gatewayBaseUrl(): string {
  const cfg = typeof window !== "undefined" ? window.__HOUSTON_ENGINE__ : null;
  if (!cfg?.baseUrl) {
    throw new Error("migration: the cloud connection isn't ready yet");
  }
  return cfg.baseUrl.replace(/\/+$/, "");
}

async function gatewayFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const base = gatewayBaseUrl();
  const send = (bearer: string) => {
    const headers = new Headers(init?.headers);
    if (bearer) headers.set("Authorization", `Bearer ${bearer}`);
    return fetch(`${base}${path}`, { ...init, headers });
  };
  const res = await send(window.__HOUSTON_ENGINE__?.token ?? "");
  if (res.status !== 401) return res;
  const fresh = await window.__HOUSTON_SESSION_REFRESH__?.();
  if (!fresh) return res;
  return send(fresh);
}

/** Upload one raw zip chunk into a cloud agent. `overwrite` on retries so a
 *  re-sent chunk lands cleanly over a partial first attempt. */
export async function importAgentZip(
  agentId: string,
  zip: ArrayBuffer,
  opts?: { overwrite?: boolean },
): Promise<ImportResult> {
  const query = opts?.overwrite ? "?overwrite=1" : "";
  const res = await gatewayFetch(
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
  const res = await gatewayFetch(
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
  const res = await gatewayFetch(
    `/agents/${encodeURIComponent(agentId)}/migration/status`,
  );
  // An older pod without the route reads as "never imported" — resume just
  // won't skip it, which at worst re-plans an agent under a renamed target.
  if (res.status === 404) return null;
  if (!res.ok) await throwHttpError("migration status", res);
  const body = (await res.json()) as { imported: MigrationMarker | null };
  return body.imported;
}
