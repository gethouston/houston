import { docKey, type HoustonFamily } from "@houston/domain";
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
    this.ready = this.deps.shadow.seed().catch((error: unknown) => {
      console.debug("[doc-shadow] boot revision seed failed", error);
    });
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
    const raw = await this.deps.vfs.readText(docKey(root, family));
    if (raw === null) return;
    await this.deps.shadow.put(
      family,
      JSON.parse(raw.replace(/^\uFEFF/, "")) as unknown,
    );
  }
}
