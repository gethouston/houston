import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
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
import {
  isDir,
  isWorkspaceDirName,
  listDirs,
  listWorkspaceDirs,
} from "./local-dirs";

export class LocalWorkspaceStore implements WorkspaceStore {
  constructor(
    private readonly root: string,
    private readonly ownerUserId: UserId = "local-owner",
    private readonly defaultWorkspace = "Personal",
  ) {
    mkdirSync(root, { recursive: true });
  }

  private toWorkspace(name: string): Workspace {
    return {
      id: name,
      ownerUserId: this.ownerUserId,
      kind: "personal",
      name,
      slug: name,
      runtime: "local",
      createdAt: 0,
    };
  }

  private toAgent(wsName: string, agentName: string): Agent {
    return {
      id: `${wsName}/${agentName}`,
      workspaceId: wsName,
      name: agentName,
      createdAt: 0,
    };
  }

  async getOrCreatePersonalWorkspace(_userId: UserId): Promise<Workspace> {
    const existing = listWorkspaceDirs(this.root);
    const name = existing[0] ?? this.defaultWorkspace;
    mkdirSync(join(this.root, name), { recursive: true });
    return this.toWorkspace(name);
  }

  async getWorkspace(id: WorkspaceId): Promise<Workspace | null> {
    return isWorkspaceDirName(id) && isDir(join(this.root, id))
      ? this.toWorkspace(id)
      : null;
  }

  async getAgent(id: AgentId): Promise<Agent | null> {
    const slash = id.indexOf("/");
    if (slash === -1) return null;
    const wsName = id.slice(0, slash);
    const agentName = id.slice(slash + 1);
    if (!agentName || agentName.includes("/") || id.includes("..")) return null;
    return isWorkspaceDirName(wsName) &&
      isDir(join(this.root, wsName, agentName))
      ? this.toAgent(wsName, agentName)
      : null;
  }

  async listAgents(workspaceId: WorkspaceId): Promise<Agent[]> {
    if (!isWorkspaceDirName(workspaceId)) return [];
    return listDirs(join(this.root, workspaceId)).map((name) =>
      this.toAgent(workspaceId, name),
    );
  }

  async listWorkspaces(): Promise<Workspace[]> {
    return listWorkspaceDirs(this.root).map((name) => this.toWorkspace(name));
  }

  async listWorkspacesForUser(_userId: UserId): Promise<Workspace[]> {
    return this.listWorkspaces();
  }

  async listAllAgents(): Promise<Agent[]> {
    const out: Agent[] = [];
    for (const ws of listWorkspaceDirs(this.root)) {
      for (const a of listDirs(join(this.root, ws)))
        out.push(this.toAgent(ws, a));
    }
    return out;
  }

  private nameTaken(
    workspaceId: WorkspaceId,
    name: string,
    except?: string,
  ): boolean {
    return listDirs(join(this.root, workspaceId)).some(
      (existing) => existing !== except && sameAgentName(existing, name),
    );
  }

  async createAgent(input: {
    workspaceId: WorkspaceId;
    name: string;
  }): Promise<Agent> {
    const v = validateAgentName(input.name);
    if (!v.ok) throw new InvalidAgentNameError(input.name, v.reason);
    const wsDir = join(this.root, input.workspaceId);
    mkdirSync(wsDir, { recursive: true });
    if (this.nameTaken(input.workspaceId, v.name))
      throw new AgentNameConflictError(v.name);
    try {
      mkdirSync(join(wsDir, v.name));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST")
        throw new AgentNameConflictError(v.name);
      throw err;
    }
    return this.toAgent(input.workspaceId, v.name);
  }

  async renameAgent(id: AgentId, name: string): Promise<Agent> {
    const agent = await this.getAgent(id);
    if (!agent) throw new Error(`renameAgent: unknown agent ${id}`);
    const v = validateAgentName(name);
    if (!v.ok) throw new InvalidAgentNameError(name, v.reason);
    if (v.name === agent.name) return agent;
    const dest = join(this.root, agent.workspaceId, v.name);
    if (
      this.nameTaken(agent.workspaceId, v.name, agent.name) ||
      (!sameAgentName(agent.name, v.name) && existsSync(dest))
    )
      throw new AgentNameConflictError(v.name);
    renameSync(join(this.root, agent.workspaceId, agent.name), dest);
    return this.toAgent(agent.workspaceId, v.name);
  }

  async deleteAgent(id: AgentId): Promise<void> {
    const agent = await this.getAgent(id);
    if (!agent) throw new Error(`deleteAgent: unknown agent ${id}`);
    rmSync(join(this.root, agent.workspaceId, agent.name), {
      recursive: true,
      force: true,
    });
  }

  async setWorkspaceRuntime(
    _id: WorkspaceId,
    _runtime: WorkspaceRuntime,
  ): Promise<Workspace> {
    throw new Error(
      "local workspaces always run 'local' — runtime is not switchable",
    );
  }
}
