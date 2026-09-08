import type { HoustonFamily } from "@houston/domain";
import type { HoustonEvent } from "@houston/protocol";
import {
  bootBindingId,
  EVENT_FAMILY,
  type ProjectorDeps,
  putFamilyDoc,
  singleAgentId,
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
  private rebinding: Promise<void> | undefined;
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
      .then(async () => {
        const only = await bootBindingId(this.deps.store);
        if (only === undefined) return;
        this.bound = only;
        await this.seedBound(only);
      })
      .catch((error: unknown) => {
        console.error("[doc-shadow] boot seed failed", error);
      });
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
    await this.rebindIfMoved();
    return this.bound;
  }

  async flush(): Promise<void> {
    await this.ready;
    await Promise.all([...this.tails.values()]);
  }

  private async project(agentId: string, family: HoustonFamily): Promise<void> {
    if (this.bound === undefined) {
      // Bind on first projection when boot found no agents; several agents
      // stay ambiguous until bindAddressed.
      if ((await singleAgentId(this.deps.store)) !== agentId) return;
      this.rebind(agentId, family, "agent hydrated after boot");
    } else if (agentId !== this.bound) {
      await this.rebindIfMoved(family);
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
   * Follow a rename. The binding is a directory name and a rename moves the
   * directory — often on the very wake that booted this pod, since the rename
   * request is what woke it. Left alone, every projection and view publish
   * for the renamed agent is refused as cross-agent until the next pod
   * restart, and asleep readers keep getting the pre-rename docs
   * (HOUSTON-APP-5AP). Re-binds only when the bound directory is gone AND
   * exactly one remains; a delete (none left) or a leftover beside the live
   * agent (several) keeps the old binding, as ambiguous as at seed.
   */
  private rebindIfMoved(family?: HoustonFamily): Promise<void> {
    this.rebinding ??= (async () => {
      const bound = this.bound;
      if (bound === undefined) return;
      if ((await this.deps.store.getAgent(bound)) !== null) return;
      const only = await singleAgentId(this.deps.store);
      if (only === null || only === bound) return;
      this.refused.clear();
      this.rebind(only, family, `agent directory moved from ${bound}`);
    })().finally(() => {
      this.rebinding = undefined;
    });
    return this.rebinding;
  }

  /** Bind late; every family but the one in flight is enqueued so the boot
   *  seed this pod missed (or seeded under another name) still happens. */
  private rebind(
    agentId: string,
    inFlight: HoustonFamily | undefined,
    why: string,
  ): void {
    this.bound = agentId;
    console.warn(
      `[doc-shadow] bound to ${agentId} (${why}); seeding remaining families`,
    );
    for (const other of Object.values(EVENT_FAMILY)) {
      if (other && other !== inFlight) this.enqueue(agentId, other);
    }
  }
}
