import {
  docKey,
  type HoustonFamily,
  normalizeActivities,
  normalizeLearnings,
  normalizeRoutineRuns,
  normalizeRoutines,
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
  // The shadow's doc route is bound to ONE agent (the cloud pod's). Seeding
  // pins that agent; any other agent id reaching project() (leftover dirs on
  // a pod volume, unexpected multi-agent hosts) must never cross-post into
  // the bound agent's doc. null = ambiguous host, all projection refused.
  private bound: string | null | undefined;

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
        console.error("[doc-shadow] boot seed failed", error);
      });
  }

  private async seedContent(): Promise<void> {
    const agents: string[] = [];
    for (const workspace of await this.deps.store.listWorkspaces()) {
      for (const agent of await this.deps.store.listAgents(workspace.id)) {
        agents.push(agent.id);
      }
    }
    const only = agents.length === 1 ? agents[0] : undefined;
    if (only === undefined) {
      // The single doc route cannot be attributed: refuse every projection
      // rather than post one agent's files under another's docs.
      this.bound = null;
      console.error(
        `[doc-shadow] host serves ${agents.length} agents but the doc route binds one; doc projection disabled`,
      );
      return;
    }
    this.bound = only;
    for (const family of Object.values(EVENT_FAMILY)) {
      if (!family) continue;
      try {
        await this.project(only, family);
      } catch (error) {
        console.error(
          `[doc-shadow] boot content seed ${this.bound}#${family} failed`,
          error,
        );
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
        console.error(`[doc-shadow] ${key} projection failed`, error);
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
    if (this.bound === null) return; // ambiguous host, reported at seed
    if (this.bound !== undefined && agentId !== this.bound) {
      console.error(
        `[doc-shadow] refusing cross-agent projection ${agentId}#${family} (route bound to ${this.bound})`,
      );
      return;
    }
    const agent = await this.deps.store.getAgent(agentId);
    if (!agent) return;
    const workspace = await this.deps.store.getWorkspace(agent.workspaceId);
    if (!workspace) return;
    const root = this.deps.paths.agentRoot(workspace, agent);
    const key = docKey(root, family);
    const raw = await this.deps.vfs.readText(key);
    if (raw === null) {
      // A vanished/never-written family file must still converge the doc:
      // the pod's own read of an absent file answers empty, so the doc does
      // too (else a deleted routines.json would keep firing removed routines
      // through the external scheduler forever).
      await this.deps.shadow.put(family, family === "config" ? {} : []);
      return;
    }
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, "")) as unknown;
    // Every family the gateway can serve pod-less is projected NORMALIZED —
    // the exact shape the pod's own read would return (malformed entries
    // dropped, defaults applied), so the doc-served answer and the pod-served
    // answer stay byte-equivalent. Behavior lives once, in the domain
    // normalizers; they are idempotent, so each doc also remains a valid
    // family file for any future reconstruction. For host-written files this
    // is a byte-level no-op.
    await this.deps.shadow.put(family, normalizeFamilyDoc(family, parsed, key));
  }
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
