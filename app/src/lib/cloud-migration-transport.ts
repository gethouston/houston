/**
 * HTTP transport for the cloud-migration wizard (HOU-719).
 *
 * Two peers:
 *  - the SOURCE host — the passive sidecar `start_migration_source_host`
 *    spawned against the old `~/.houston` tree (loopback URL + static bearer).
 *    A different deployment with its own base URL, which the app's one bound
 *    client — rooted at the live account's engine — cannot address, so this
 *    half fetches for itself;
 *  - the CLOUD GATEWAY — the same account and the same engine the whole app
 *    already talks to, so it rides the bound client (`sdk.migration` behind
 *    `getEngine()`), which owns the live bearer, the 401 refresh-and-replay and
 *    the active-space header.
 *
 * The rows' copy for a failed gateway call lives in `cloud-migration-errors.ts`
 * — the per-agent row renders the thrown `Error.message` verbatim.
 */

import type { MigrationCounts, MigrationSource } from "@houston/engine-adapter";
import type { SourceAgent } from "./cloud-migration";
import {
  type MigrationCallDeps,
  type MigrationGatewayEngine,
  migrationCall,
  nullOn404,
} from "./cloud-migration-errors.ts";
import { getEngine } from "./engine";
import i18n from "./i18n";

export interface SourceHostHandshake {
  baseUrl: string;
  token: string;
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

async function throwHttpError(label: string, res: Response): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: unknown };
  const detail =
    typeof body.error === "string" && body.error
      ? body.error
      : `HTTP ${res.status}`;
  throw new Error(`${label}: ${detail}`);
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

// ── Cloud gateway (the app's own bound client) ────────────────────────

/** The live wiring of `cloud-migration-errors.ts`: the bound client, and the
 *  authored copy the rows render. `i18n.t` (not the hook) is how a non-React
 *  lib module speaks, as in `provider-login-error.ts`. */
function gatewayDeps(): MigrationCallDeps {
  return {
    engine: getEngine,
    copy: {
      notConnected: i18n.t("migration:transport.notConnected"),
      signedOut: i18n.t("migration:transport.signedOut"),
    },
  };
}

const cloudCall = <T>(
  label: string,
  call: (engine: MigrationGatewayEngine) => Promise<T>,
): Promise<T> => migrationCall(label, gatewayDeps(), call);

/** Upload one raw zip chunk into a cloud agent. `overwrite` on retries so a
 *  re-sent chunk lands cleanly over a partial first attempt. */
export const importAgentZip = (
  agentId: string,
  zip: ArrayBuffer,
  opts?: { overwrite?: boolean },
) =>
  cloudCall("migration import", (engine) =>
    engine.migrationImport(agentId, zip, opts),
  );

/** Stamp the import marker once every chunk of an agent has landed. */
export const completeAgentMigration = (
  agentId: string,
  source: MigrationSource,
  counts: MigrationCounts,
) =>
  cloudCall("migration complete", (engine) =>
    engine.migrationComplete(agentId, source, counts),
  );

/** An existing cloud agent's import marker, `null` when never imported. */
export const agentMigrationStatus = (agentId: string) =>
  cloudCall("migration status", (engine) =>
    nullOn404(() => engine.migrationStatus(agentId)),
  );
