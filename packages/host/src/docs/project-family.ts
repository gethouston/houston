import {
  docKey,
  type HoustonFamily,
  normalizeActivities,
  normalizeLearnings,
  normalizeRoutineRuns,
  normalizeRoutines,
  parseJsonDoc,
} from "@houston/domain";
import type { HoustonEvent } from "@houston/protocol";
import type { WorkspacePaths } from "../paths";
import type { WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";
import type { DocShadow } from "./http-shadow";

export const EVENT_FAMILY: Partial<
  Record<HoustonEvent["type"], HoustonFamily>
> = {
  ActivityChanged: "activity",
  RoutinesChanged: "routines",
  RoutineRunsChanged: "routine_runs",
  ConfigChanged: "config",
  LearningsChanged: "learnings",
};

export interface ProjectorDeps {
  store: WorkspaceStore;
  vfs: Vfs;
  paths: WorkspacePaths;
  shadow: DocShadow;
}

export async function listAgentIds(store: WorkspaceStore): Promise<string[]> {
  const agents: string[] = [];
  for (const workspace of await store.listWorkspaces()) {
    for (const agent of await store.listAgents(workspace.id)) {
      agents.push(agent.id);
    }
  }
  return agents;
}

export async function bootBindingId(
  store: WorkspaceStore,
): Promise<string | undefined> {
  const agents = await listAgentIds(store);
  if (agents.length === 1) return agents[0];
  console.warn(
    agents.length === 0
      ? "[doc-shadow] no agents at boot seed; binding on first projection"
      : `[doc-shadow] host serves ${agents.length} agents; binding deferred to the first addressed agent`,
  );
  return undefined;
}

export async function singleAgentId(
  store: WorkspaceStore,
): Promise<string | null> {
  const agents = await listAgentIds(store);
  return agents.length === 1 ? (agents[0] ?? null) : null;
}

export async function putFamilyDoc(
  deps: ProjectorDeps,
  agentId: string,
  family: HoustonFamily,
): Promise<void> {
  const agent = await deps.store.getAgent(agentId);
  if (!agent) return;
  const workspace = await deps.store.getWorkspace(agent.workspaceId);
  if (!workspace) return;
  const root = deps.paths.agentRoot(workspace, agent);
  const key = docKey(root, family);
  const raw = await deps.vfs.readText(key);
  if (raw === null) {
    await deps.shadow.put(family, family === "config" ? {} : []);
    return;
  }
  const parsed = parseJsonDoc(raw, key);
  await deps.shadow.put(family, normalizeFamilyDoc(family, parsed, key));
}

function normalizeFamilyDoc(
  family: HoustonFamily,
  parsed: unknown,
  key: string,
): unknown {
  switch (family) {
    case "activity":
      return normalizeActivities(parsed, key).items;
    case "routines":
      return normalizeRoutines(parsed, key).items;
    case "routine_runs":
      return normalizeRoutineRuns(parsed, key).items;
    case "learnings":
      return normalizeLearnings(parsed, key).items;
    case "config":
      return parsed !== null &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
        ? parsed
        : {};
    default:
      return parsed;
  }
}
