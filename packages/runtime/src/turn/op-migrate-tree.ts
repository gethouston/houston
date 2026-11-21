import { PREFERENCES_NAMESPACE } from "@houston/domain";
import { AGENT_STORE_MIGRATION_PATHS } from "@houston/host/src/migrate/agent-store";
import { agentRouteScope, type OpInclude } from "./op-scope";

export const LEGACY_SECRETS_FILE = "custom-integration-secrets.json";

export const PREFERENCES_PREFIX = `workspaces/${PREFERENCES_NAMESPACE}/`;

export function migrateHydrateFilter(rel: string): boolean {
  if (rel === LEGACY_SECRETS_FILE || rel.startsWith(PREFERENCES_PREFIX))
    return true;
  const parts = rel.split("/");
  if (parts[0] !== "workspaces" || parts.length < 4) return false;
  return AGENT_STORE_MIGRATION_PATHS.has(parts.slice(3).join("/"));
}

export function migrateScope(workspaceRel: string): OpInclude {
  const agent = agentRouteScope(workspaceRel);
  return (rel) =>
    agent(rel) ||
    rel.startsWith(PREFERENCES_PREFIX) ||
    rel === LEGACY_SECRETS_FILE;
}
