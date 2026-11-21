import type { HoustonEvent } from "@houston/protocol";
import type { WorkspacePaths } from "../paths";
import type { WorkspaceStore } from "../ports";
import type { Vfs } from "../vfs";
import { readAgentRole } from "./read-role";

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
  announce: (event: HoustonEvent) => void;
  publish?: (agentId: string, role: string | undefined) => Promise<void>;
}

export class AgentRoleTracker {
  private readonly known = new Map<string, string | undefined>();
  private readonly tails = new Map<string, Promise<void>>();

  constructor(private readonly deps: AgentRoleTrackerDeps) {}

  onEvent(event: HoustonEvent): void {
    if (event.type === "ContextChanged") this.track(event.agentPath);
  }

  track(agentId: string): void {
    const prior = this.tails.get(agentId) ?? Promise.resolve();
    const task = prior
      .then(() => this.sync(agentId))
      .catch((error: unknown) => {
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
    this.known.delete(agentId);
    await this.deps.publish?.(agentId, role);
    this.known.set(agentId, role);
    this.deps.announce({ type: "AgentRoleChanged", agentPath: agentId });
  }
}
