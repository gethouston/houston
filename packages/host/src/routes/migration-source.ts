import type { ServerResponse } from "node:http";
import type { UserId } from "../domain/types";
import type { WorkspacePaths } from "../paths";
import { CloudPaths } from "../paths";
import type { WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";
import { json } from "./http";
import { legacyConnectedToolkits } from "./migration-legacy-composio";
import {
  classifyMigrationPath,
  MAX_MIGRATION_FILE_BYTES,
  type MigrationKind,
  toolkitsFromIntegrationsJson,
} from "./migration-scope";

/**
 * The SOURCE side of the one-click desktop→cloud migration (HOU-719): the new
 * cloud app spawns the bundled host briefly against the old `~/.houston` (boot
 * runs the proven layout + chat-history migrations first), then asks it what
 * there is to move. `GET /v1/migration/source` enumerates every agent across
 * every workspace with its migration manifest, so the wizard can plan uploads
 * in one call. Local/desktop only by design — the cloud gateway proxies only
 * agent-scoped routes, so this surface is unreachable on a pod.
 */

export interface MigrationEntry {
  /** Agent-root-relative path, forward slashes. */
  path: string;
  size: number;
  kind: MigrationKind;
}

export interface MigrationManifest {
  entries: MigrationEntry[];
  /** What stays behind, with why — surfaced in the wizard, never silent. */
  excluded: { path: string; size: number; reason: "too-large" }[];
  /** Rust-era Composio toolkit slugs — feeds the reconnect checklist. */
  integrations: string[];
  totalBytes: number;
}

export async function buildMigrationManifest(
  vfs: Vfs,
  root: string,
): Promise<MigrationManifest> {
  const entries: MigrationEntry[] = [];
  const excluded: MigrationManifest["excluded"] = [];
  let totalBytes = 0;
  for (const stat of await vfs.listDetailed(root)) {
    const rel = stat.key.slice(root.length + 1);
    if (!rel) continue;
    const kind = classifyMigrationPath(rel);
    if (kind === null) continue;
    if (stat.size > MAX_MIGRATION_FILE_BYTES) {
      excluded.push({ path: rel, size: stat.size, reason: "too-large" });
      continue;
    }
    entries.push({ path: rel, size: stat.size, kind });
    totalBytes += stat.size;
  }
  const integrationsJson = await vfs.readText(
    `${root}/.houston/integrations.json`,
  );
  return {
    entries,
    excluded,
    integrations: integrationsJson
      ? toolkitsFromIntegrationsJson(integrationsJson)
      : [],
    totalBytes,
  };
}

export interface MigrationSourceDeps {
  store: WorkspaceStore;
  vfs?: Vfs;
  paths?: WorkspacePaths;
  /** Injectable for tests; defaults to the real `~/.composio` REST probe. */
  accountIntegrations?: () => Promise<string[]>;
}

/** `GET /v1/migration/source` — every agent, every workspace, with manifests,
 *  plus the legacy Composio account's connected toolkits (best-effort). */
export async function handleMigrationSource(
  deps: MigrationSourceDeps,
  _userId: UserId,
  method: string,
  path: string,
  res: ServerResponse,
): Promise<boolean> {
  if (path !== "/v1/migration/source" || method !== "GET") return false;
  if (!deps.vfs) {
    json(res, 503, { error: "agent data not configured" });
    return true;
  }
  const vfs = deps.vfs;
  const paths = deps.paths ?? new CloudPaths();
  // The account-level probe (network) runs alongside the manifest walk (disk).
  const accountIntegrationsPromise = (
    deps.accountIntegrations ?? legacyConnectedToolkits
  )();
  const agents = [];
  for (const agent of await deps.store.listAllAgents()) {
    const ws = await deps.store.getWorkspace(agent.workspaceId);
    if (!ws) continue; // deleted between list and read — nothing to migrate
    agents.push({
      id: agent.id,
      workspaceId: agent.workspaceId,
      name: agent.name,
      manifest: await buildMigrationManifest(vfs, paths.agentRoot(ws, agent)),
    });
  }
  json(res, 200, {
    agents,
    accountIntegrations: await accountIntegrationsPromise,
  });
  return true;
}
