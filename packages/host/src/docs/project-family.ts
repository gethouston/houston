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

/** Every agent id the host serves, across all workspaces. */
export async function listAgentIds(store: WorkspaceStore): Promise<string[]> {
  const agents: string[] = [];
  for (const workspace of await store.listWorkspaces()) {
    for (const agent of await store.listAgents(workspace.id)) {
      agents.push(agent.id);
    }
  }
  return agents;
}

/** Read one agent's family file and PUT it into the doc shadow. */
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
    // A vanished/never-written family file must still converge the doc:
    // the pod's own read of an absent file answers empty, so the doc does
    // too (else a deleted routines.json would keep firing removed routines
    // through the external scheduler forever).
    await deps.shadow.put(family, family === "config" ? {} : []);
    return;
  }
  // Same tolerant parse as the pod's own read (loadJson): BOM strip +
  // trailing-junk salvage, and an unparseable file names its key. A file
  // the pod can read must never crash-loop the projection (HOUSTON-APP-5A9).
  const parsed = parseJsonDoc(raw, key);
  // Every family the gateway can serve pod-less is projected NORMALIZED —
  // the exact shape the pod's own read would return (malformed entries
  // dropped, defaults applied), so the doc-served answer and the pod-served
  // answer stay byte-equivalent. Behavior lives once, in the domain
  // normalizers; they are idempotent, so each doc also remains a valid
  // family file for any future reconstruction. For host-written files this
  // is a byte-level no-op.
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
      // config.json is one object; a non-object file reads as empty.
      return parsed !== null &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
        ? parsed
        : {};
    default:
      return parsed;
  }
}
