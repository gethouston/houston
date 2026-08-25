import type { HoustonFamily } from "@houston/domain";
import type { HoustonEvent } from "@houston/protocol";
import {
  EVENT_FAMILY,
  listAgentIds,
  type ProjectorDeps,
  putFamilyDoc,
} from "./project-family";

/**
 * Projects watcher-observed family files into the managed DB shadow. The same
 * path sees host writes and direct agent edits; all I/O is serialized per
 * family and contained here so watcher delivery never waits or fails.
 */
export class DocShadowProjector {
  private readonly tails = new Map<string, Promise<void>>();
  private ready: Promise<void> = Promise.resolve();
  // The shadow's doc route is bound to ONE agent (the cloud pod's). A host
  // with exactly one agent binds at seed; a host with several (rename
  // leftovers like `Personal/Old Name` beside the live agent are common on
  // pod volumes) cannot tell them apart itself and DEFERS: the gateway names
  // the real agent in every authenticated /agents/<id>/ request, and the
  // first such request binds. Any other agent id reaching project() is
  // refused — nothing may cross-post into the bound agent's doc.
  private bound: string | undefined;
  private addressing = false;
  private readonly refused = new Set<string>();

  constructor(private readonly deps: ProjectorDeps) {}

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
    const agents = await listAgentIds(this.deps.store);
    if (agents.length === 0) {
      // Cloud pods can reach boot before the workspace tree hydrates (seen
      // live: real agent pods with zero agents at seed time). Not an error
      // and NOT a poison: the hydration writes fire watcher events, and the
      // first projection binds late and back-fills the whole seed.
      console.warn(
        "[doc-shadow] no agents at boot seed; binding on first projection",
      );
      return;
    }
    const only = agents.length === 1 ? agents[0] : undefined;
    if (only === undefined) {
      console.warn(
        `[doc-shadow] host serves ${agents.length} agents; binding deferred to the first addressed agent`,
      );
      return;
    }
    this.bound = only;
    await this.seedBound(only);
  }

  private async seedBound(agentId: string): Promise<void> {
    for (const family of Object.values(EVENT_FAMILY)) {
      if (!family) continue;
      try {
        await this.project(agentId, family);
      } catch (error) {
        console.error(
          `[doc-shadow] boot content seed ${agentId}#${family} failed`,
          error,
        );
      }
    }
  }

  /**
   * An authenticated request addressed this agent. On a host that could not
   * bind at seed (several agent directories), the gateway's choice IS the
   * binding: it addresses the registry's engine id, never a leftover. Binds
   * once and back-fills the boot seed; later calls are no-ops.
   */
  bindAddressed(agentId: string): void {
    if (this.bound !== undefined || this.addressing) return;
    this.addressing = true;
    const task = this.ready
      .then(async () => {
        if (this.bound !== undefined) return;
        if (!(await this.deps.store.getAgent(agentId))) return;
        this.bound = agentId;
        console.warn(
          `[doc-shadow] bound to ${agentId} from the first addressed request; seeding`,
        );
        await this.seedBound(agentId);
      })
      .catch((error: unknown) => {
        console.error(`[doc-shadow] addressed bind ${agentId} failed`, error);
      })
      .finally(() => {
        this.addressing = false;
      });
    this.ready = task;
  }

  onEvent(event: HoustonEvent): void {
    const family = EVENT_FAMILY[event.type];
    if (!family || !("agentPath" in event)) return;
    this.enqueue(event.agentPath, family);
  }

  private enqueue(agentId: string, family: HoustonFamily): void {
    const key = `${agentId}#${family}`;
    const prior = this.tails.get(key) ?? this.ready;
    const task = prior
      .then(() => this.project(agentId, family))
      .catch((error: unknown) => {
        console.error(`[doc-shadow] ${key} projection failed`, error);
      })
      .finally(() => {
        if (this.tails.get(key) === task) this.tails.delete(key);
      });
    this.tails.set(key, task);
  }

  /**
   * Resolves to the bound agent id once the boot seed has settled (or to
   * undefined if the host could not bind). The view sink consults it so an
   * answer captured for any other agent id (a leftover directory on a pod
   * volume) is never published as the bound agent's doc — the same
   * cross-post rule project() enforces for family files.
   */
  async boundAgent(): Promise<string | undefined> {
    await this.ready;
    return this.bound;
  }

  async flush(): Promise<void> {
    await this.ready;
    await Promise.all([...this.tails.values()]);
  }

  private async project(agentId: string, family: HoustonFamily): Promise<void> {
    if (this.bound === undefined && !(await this.lazyBind(agentId, family))) {
      return;
    }
    if (agentId !== this.bound) {
      // The refusal is the DESIGNED outcome (rename leftovers beside the live
      // agent fire watcher events too), so it is a warn, and latched: one
      // leftover directory otherwise repeats this on every file change.
      const refusedKey = `${agentId}#${family}`;
      if (!this.refused.has(refusedKey)) {
        this.refused.add(refusedKey);
        console.warn(
          `[doc-shadow] refusing cross-agent projection ${refusedKey} (route bound to ${this.bound})`,
        );
      }
      return;
    }
    await putFamilyDoc(this.deps, agentId, family);
  }

  /**
   * Bind on first projection when boot found no agents. True = agentId is
   * the host's single agent; the remaining families are enqueued so the
   * boot seed this pod missed still happens. Several agents = still
   * ambiguous: wait for bindAddressed.
   */
  private async lazyBind(
    agentId: string,
    family: HoustonFamily,
  ): Promise<boolean> {
    const agents = await listAgentIds(this.deps.store);
    if (agents.length !== 1 || agents[0] !== agentId) return false;
    this.bound = agentId;
    console.warn(
      `[doc-shadow] bound to ${agentId} on first projection (agent hydrated after boot); seeding remaining families`,
    );
    for (const other of Object.values(EVENT_FAMILY)) {
      if (other && other !== family) this.enqueue(agentId, other);
    }
    return true;
  }
}
