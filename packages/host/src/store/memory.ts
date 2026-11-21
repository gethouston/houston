import { sameAgentName, validateAgentName } from "@houston/domain";
import type {
  Agent,
  AgentId,
  UserId,
  Workspace,
  WorkspaceId,
  WorkspaceRuntime,
} from "../domain/types";
import {
  AgentNameConflictError,
  InvalidAgentNameError,
  type WorkspaceStore,
} from "../ports";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workspace"
  );
}

export class MemoryWorkspaceStore implements WorkspaceStore {
  private workspaces = new Map<WorkspaceId, Workspace>();
  private agents = new Map<AgentId, Agent>();
  private seq = 0;
  private readonly defaultRuntime: WorkspaceRuntime;

  constructor(opts: { defaultRuntime?: WorkspaceRuntime } = {}) {
    this.defaultRuntime = opts.defaultRuntime ?? "gke";
  }

  private id(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${this.seq.toString(36)}${Date.now().toString(36)}`;
  }

  async getOrCreatePersonalWorkspace(userId: UserId): Promise<Workspace> {
    for (const ws of this.workspaces.values()) {
      if (ws.kind === "personal" && ws.ownerUserId === userId) return ws;
    }
    const ws: Workspace = {
      id: this.id("ws"),
      ownerUserId: userId,
      kind: "personal",
      name: "Personal",
      slug: slugify(userId),
      runtime: this.defaultRuntime,
      createdAt: Date.now(),
    };
    this.workspaces.set(ws.id, ws);
    return ws;
  }

  async getWorkspace(id: WorkspaceId): Promise<Workspace | null> {
    return this.workspaces.get(id) ?? null;
  }

  async getAgent(id: AgentId): Promise<Agent | null> {
    return this.agents.get(id) ?? null;
  }

  async listAgents(workspaceId: WorkspaceId): Promise<Agent[]> {
    return [...this.agents.values()].filter(
      (a) => a.workspaceId === workspaceId,
    );
  }

  async listWorkspaces(): Promise<Workspace[]> {
    return [...this.workspaces.values()];
  }

  async listWorkspacesForUser(userId: UserId): Promise<Workspace[]> {
    return [...this.workspaces.values()].filter(
      (w) => w.ownerUserId === userId,
    );
  }

  async listAllAgents(): Promise<Agent[]> {
    return [...this.agents.values()];
  }

  private nameTaken(
    workspaceId: WorkspaceId,
    name: string,
    except?: AgentId,
  ): boolean {
    for (const other of this.agents.values()) {
      if (
        other.workspaceId === workspaceId &&
        other.id !== except &&
        sameAgentName(other.name, name)
      )
        return true;
    }
    return false;
  }

  async createAgent(input: {
    workspaceId: WorkspaceId;
    name: string;
  }): Promise<Agent> {
    const v = validateAgentName(input.name);
    if (!v.ok) throw new InvalidAgentNameError(input.name, v.reason);
    if (this.nameTaken(input.workspaceId, v.name))
      throw new AgentNameConflictError(v.name);
    const agent: Agent = {
      id: this.id("agent"),
      workspaceId: input.workspaceId,
      name: v.name,
      createdAt: Date.now(),
    };
    this.agents.set(agent.id, agent);
    return agent;
  }

  async renameAgent(id: AgentId, name: string): Promise<Agent> {
    const agent = this.agents.get(id);
    if (!agent) throw new Error(`renameAgent: unknown agent ${id}`);
    const v = validateAgentName(name);
    if (!v.ok) throw new InvalidAgentNameError(name, v.reason);
    if (v.name === agent.name) return agent;
    if (this.nameTaken(agent.workspaceId, v.name, id))
      throw new AgentNameConflictError(v.name);
    const next: Agent = { ...agent, name: v.name };
    this.agents.set(id, next);
    return next;
  }

  async deleteAgent(id: AgentId): Promise<void> {
    if (!this.agents.delete(id))
      throw new Error(`deleteAgent: unknown agent ${id}`);
  }

  async setWorkspaceRuntime(
    id: WorkspaceId,
    runtime: WorkspaceRuntime,
  ): Promise<Workspace> {
    const ws = this.workspaces.get(id);
    if (!ws) throw new Error(`setWorkspaceRuntime: unknown workspace ${id}`);
    const next: Workspace = { ...ws, runtime };
    this.workspaces.set(id, next);
    return next;
  }
}
