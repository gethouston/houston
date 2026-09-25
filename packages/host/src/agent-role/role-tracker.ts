import type { HoustonEvent } from "@houston/protocol";
import type { WorkspacePaths } from "../paths";
import type { WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";
import { readAgentRole } from "./read-role";

/**
 * The role did not land where the listing reads it (the doc route is not bound
 * yet, or the gateway deferred the write). Transient by contract: the agent's
 * next addressed request retries it, so it is a warning, never an error.
 */
export class RolePublishDeferredError extends Error {
  constructor(agentId: string, reason: string) {
    super(`${agentId} role publish deferred: ${reason}`);
    this.name = "RolePublishDeferredError";
  }
}

export interface AgentRoleTrackerDeps {
  store: WorkspaceStore;
  vfs: Vfs;
  paths: WorkspacePaths;
  /** Raise an event on the host's global channel. */
  announce: (event: HoustonEvent) => void;
  /**
   * Make the role durable where the agent listing reads it, BEFORE it is
   * announced. Gateway-fronted pods only: the gateway lists agents from its own
   * database, so a client that re-lists on the announcement must already find
   * the new role there. Absent where the host serves the listing itself.
   */
  publish?: (agentId: string, role: string | undefined) => Promise<void>;
}

/**
 * Keeps the role each agent's listing names in step with its job description,
 * whoever rewrote it: the person in the Job description tab, the agent with its
 * own file tools, or a create seeding it. Fed the watcher's `ContextChanged`,
 * it re-reads the role and, when it moved, publishes it (gateway-fronted pods)
 * and then raises `AgentRoleChanged`, so every surface re-lists without a
 * refresh.
 *
 * The first read of an agent in a process always counts as a change. That is
 * the lazy backfill: a pod whose agent predates the role document publishes it
 * as soon as the doc route binds after boot ({@link ensureTracked}).
 */
export class AgentRoleTracker {
  private readonly known = new Map<string, string | undefined>();
  private readonly tails = new Map<string, Promise<void>>();

  constructor(private readonly deps: AgentRoleTrackerDeps) {}

  onEvent(event: HoustonEvent): void {
    if (event.type === "ContextChanged") this.track(event.agentPath);
  }

  /** Re-read one agent's role. Serialized per agent, so the last write wins. */
  track(agentId: string): void {
    const prior = this.tails.get(agentId) ?? Promise.resolve();
    const task = prior
      .then(() => this.sync(agentId))
      .catch((error: unknown) => {
        // A watcher-driven daemon: no UI thread to report to. The role stays
        // unrecorded, so the next change to the file, or the agent's next
        // addressed request ({@link ensureTracked}), retries the publish.
        if (error instanceof RolePublishDeferredError) {
          console.warn(`[agent-role] ${error.message}`);
        } else {
          console.error(`[agent-role] ${agentId} role sync failed`, error);
        }
      })
      .finally(() => {
        if (this.tails.get(agentId) === task) this.tails.delete(agentId);
      });
    this.tails.set(agentId, task);
  }

  /** {@link track} an agent whose current role this process has not landed
   *  yet; a no-op after. For per-request callers (the gateway addressing its
   *  agent): a read per request would be pure waste once the role is known,
   *  and a deferred publish retries on the next request. */
  ensureTracked(agentId: string): void {
    if (this.known.has(agentId) || this.tails.has(agentId)) return;
    this.track(agentId);
  }

  async flush(): Promise<void> {
    await Promise.all([...this.tails.values()]);
  }

  private async sync(agentId: string): Promise<void> {
    const { store, vfs, paths } = this.deps;
    const agent = await store.getAgent(agentId);
    if (!agent) return;
    const workspace = await store.getWorkspace(agent.workspaceId);
    if (!workspace) return;
    const role = await readAgentRole(vfs, paths.agentRoot(workspace, agent));
    if (this.known.has(agentId) && this.known.get(agentId) === role) return;
    // Unrecorded until the new role lands, so a failed publish leaves the
    // agent for ensureTracked to retry rather than stuck on the old role.
    this.known.delete(agentId);
    await this.deps.publish?.(agentId, role);
    this.known.set(agentId, role);
    this.deps.announce({ type: "AgentRoleChanged", agentPath: agentId });
  }
}
