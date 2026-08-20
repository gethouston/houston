import {
  docKey,
  type HoustonFamily,
  normalizeActivities,
} from "@houston/domain";
import type { HoustonEvent } from "@houston/protocol";
import type { WorkspacePaths } from "../paths";
import type { WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";
import type { DocShadow } from "./http-shadow";

const EVENT_FAMILY: Partial<Record<HoustonEvent["type"], HoustonFamily>> = {
  ActivityChanged: "activity",
  RoutinesChanged: "routines",
  RoutineRunsChanged: "routine_runs",
  ConfigChanged: "config",
  LearningsChanged: "learnings",
};

/**
 * Projects watcher-observed family files into the managed DB shadow. The same
 * path sees host writes and direct agent edits; all I/O is serialized per
 * family and contained here so watcher delivery never waits or fails.
 */
export class DocShadowProjector {
  private readonly tails = new Map<string, Promise<void>>();
  private ready: Promise<void> = Promise.resolve();

  constructor(
    private readonly deps: {
      store: WorkspaceStore;
      vfs: Vfs;
      paths: WorkspacePaths;
      shadow: DocShadow;
    },
  ) {}

  seed(): void {
    // Revision seed first, then ONE content projection of every family for
    // every agent this host serves (the cloud pod serves exactly one). This
    // is what makes agents whose files predate the doc shadow eligible for
    // the database read paths and pool dispatch: without it, a doc only
    // exists after the family's first post-shadow change, which silently
    // excludes the quietest agents (observed fleet-wide in staging: one
    // routines doc across ~750 agents). The skip-if-equal PUT in the shadow
    // keeps repeat boots at one GET per family, no revision churn.
    this.ready = this.deps.shadow
      .seed()
      .then(() => this.seedContent())
      .catch((error: unknown) => {
        console.debug("[doc-shadow] boot seed failed", error);
      });
  }

  private async seedContent(): Promise<void> {
    const workspaces = await this.deps.store.listWorkspaces();
    for (const workspace of workspaces) {
      const agents = await this.deps.store.listAgents(workspace.id);
      for (const agent of agents) {
        for (const family of Object.values(EVENT_FAMILY)) {
          if (!family) continue;
          try {
            await this.project(agent.id, family);
          } catch (error) {
            console.debug(
              `[doc-shadow] boot content seed ${agent.id}#${family} failed`,
              error,
            );
          }
        }
      }
    }
  }

  onEvent(event: HoustonEvent): void {
    const family = EVENT_FAMILY[event.type];
    if (!family || !("agentPath" in event)) return;
    const key = `${event.agentPath}#${family}`;
    const prior = this.tails.get(key) ?? this.ready;
    const task = prior
      .then(() => this.project(event.agentPath, family))
      .catch((error: unknown) => {
        console.debug(`[doc-shadow] ${key} projection failed`, error);
      })
      .finally(() => {
        if (this.tails.get(key) === task) this.tails.delete(key);
      });
    this.tails.set(key, task);
  }

  async flush(): Promise<void> {
    await this.ready;
    await Promise.all([...this.tails.values()]);
  }

  private async project(agentId: string, family: HoustonFamily): Promise<void> {
    const agent = await this.deps.store.getAgent(agentId);
    if (!agent) return;
    const workspace = await this.deps.store.getWorkspace(agent.workspaceId);
    if (!workspace) return;
    const root = this.deps.paths.agentRoot(workspace, agent);
    const key = docKey(root, family);
    const raw = await this.deps.vfs.readText(key);
    if (raw === null) return;
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, "")) as unknown;
    // The activity family is READ by the gateway (the mission board is served
    // from the doc at database authority), and reads normalize via
    // normalizeActivities — malformed entries dropped, defaults applied. Keep
    // that behavior in exactly one place by projecting the NORMALIZED items:
    // for host-written files this is a byte-level no-op (saveActivities writes
    // normalized items), and for agent hand-edits the doc converges to what
    // the pod would serve. normalizeActivities is idempotent, so the doc also
    // remains a valid activity.json for any future file reconstruction.
    const doc =
      family === "activity" ? normalizeActivities(parsed, key).items : parsed;
    await this.deps.shadow.put(family, doc);
  }
}
