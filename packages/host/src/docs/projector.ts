import type { HoustonFamily } from "@houston/domain";
import type { HoustonEvent } from "@houston/protocol";
import {
  bootBindingId,
  EVENT_FAMILY,
  type ProjectorDeps,
  putFamilyDoc,
  singleAgentId,
} from "./project-family";

export class DocShadowProjector {
  private readonly tails = new Map<string, Promise<void>>();
  private ready: Promise<void> = Promise.resolve();
  private bound: string | undefined;
  private addressing = false;
  private rebinding: Promise<void> | undefined;
  private readonly refused = new Set<string>();

  constructor(private readonly deps: ProjectorDeps) {}

  seed(): void {
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
      if ((await singleAgentId(this.deps.store)) !== agentId) return;
      this.rebind(agentId, family, "agent hydrated after boot");
    } else if (agentId !== this.bound) {
      await this.rebindIfMoved(family);
    }
    if (agentId !== this.bound) {
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
