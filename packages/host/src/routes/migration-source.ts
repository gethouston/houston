import type { ServerResponse } from "node:http";
import type { WorkspacePaths } from "../paths";
import { CloudPaths } from "../paths";
import type { WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";
import { legacyAgentColor } from "./agent-legacy-color";
import { json } from "./http";
import { legacyConnectedToolkits } from "./migration-legacy-composio";
import {
  classifyMigrationPath,
  MAX_MIGRATION_FILE_BYTES,
  type MigrationKind,
  toolkitsFromIntegrationsJson,
} from "./migration-scope";
import { defineRoute } from "./registry";

export interface MigrationEntry {
  path: string;
  size: number;
  kind: MigrationKind;
}

export interface MigrationManifest {
  entries: MigrationEntry[];
  excluded: { path: string; size: number; reason: "too-large" }[];
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
  accountIntegrations?: () => Promise<string[]>;
}

defineRoute({
  group: "migration-source",
  method: "GET",
  path: "/v1/migration/source",
  phase: "user",
  classification: "sdk",
  source: "packages/host/src/routes/migration-source.ts",
  handler: ({ deps, res }) => serveMigrationSource(deps, res),
});

async function serveMigrationSource(
  deps: MigrationSourceDeps,
  res: ServerResponse,
): Promise<void> {
  if (!deps.vfs) return json(res, 503, { error: "agent data not configured" });
  const vfs = deps.vfs;
  const paths = deps.paths ?? new CloudPaths();
  const accountIntegrationsPromise = (
    deps.accountIntegrations ?? legacyConnectedToolkits
  )();
  const agents = [];
  for (const agent of await deps.store.listAllAgents()) {
    const ws = await deps.store.getWorkspace(agent.workspaceId);
    if (!ws) continue;
    const root = paths.agentRoot(ws, agent);
    agents.push({
      id: agent.id,
      workspaceId: agent.workspaceId,
      name: agent.name,
      color: await legacyAgentColor(vfs, root),
      manifest: await buildMigrationManifest(vfs, root),
    });
  }
  json(res, 200, {
    agents,
    accountIntegrations: await accountIntegrationsPromise,
  });
}
