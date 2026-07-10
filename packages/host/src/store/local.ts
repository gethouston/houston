import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import type {
  Agent,
  AgentId,
  UserId,
  Workspace,
  WorkspaceId,
  WorkspaceRuntime,
} from "../domain/types";
import { AgentNameConflictError, type WorkspaceStore } from "../ports";

/**
 * The local profile's WorkspaceStore — the desktop tree on disk is the source
 * of truth, not a database. Workspaces are the immediate subdirs of
 * `<root>` (`~/.houston/workspaces`); agents are the subdirs of each.
 *
 * Ids ARE the on-disk path: a workspace id is its folder name, an agent id is
 * `<Workspace>/<Agent>` — so the id flows unchanged through LocalPaths, the
 * FsWatcher, and reactivity events (URL transport encodes the slash). Every
 * workspace is owned by the single local user and runs `local` (ProxyChannel
 * over a ProcessLauncher). Multi-user / org tiers do not exist on a laptop.
 */
export class LocalWorkspaceStore implements WorkspaceStore {
  constructor(
    private readonly root: string,
    private readonly ownerUserId: UserId = "local-owner",
    private readonly defaultWorkspace = "Personal",
  ) {
    mkdirSync(root, { recursive: true });
  }

  private isDir(p: string): boolean {
    try {
      return statSync(p).isDirectory();
    } catch {
      return false;
    }
  }

  private listDirs(p: string): string[] {
    if (!existsSync(p)) return [];
    return readdirSync(p)
      .filter((name) => !name.startsWith(".") && this.isDir(join(p, name)))
      .sort();
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
    const existing = this.listDirs(this.root);
    const name = existing[0] ?? this.defaultWorkspace;
    mkdirSync(join(this.root, name), { recursive: true });
    return this.toWorkspace(name);
  }

  async getWorkspace(id: WorkspaceId): Promise<Workspace | null> {
    return this.isDir(join(this.root, id)) ? this.toWorkspace(id) : null;
  }

  async getAgent(id: AgentId): Promise<Agent | null> {
    const slash = id.indexOf("/");
    if (slash === -1) return null;
    const wsName = id.slice(0, slash);
    const agentName = id.slice(slash + 1);
    // Reject traversal: an agent id is exactly <Workspace>/<Agent>.
    if (!agentName || agentName.includes("/") || id.includes("..")) return null;
    return this.isDir(join(this.root, wsName, agentName))
      ? this.toAgent(wsName, agentName)
      : null;
  }

  async listAgents(workspaceId: WorkspaceId): Promise<Agent[]> {
    return this.listDirs(join(this.root, workspaceId)).map((name) =>
      this.toAgent(workspaceId, name),
    );
  }

  async listWorkspaces(): Promise<Workspace[]> {
    return this.listDirs(this.root).map((name) => this.toWorkspace(name));
  }

  async listWorkspacesForUser(_userId: UserId): Promise<Workspace[]> {
    return this.listWorkspaces(); // one user on a laptop
  }

  async listAllAgents(): Promise<Agent[]> {
    const out: Agent[] = [];
    for (const ws of this.listDirs(this.root)) {
      for (const a of this.listDirs(join(this.root, ws)))
        out.push(this.toAgent(ws, a));
    }
    return out;
  }

  async createAgent(input: {
    workspaceId: WorkspaceId;
    name: string;
  }): Promise<Agent> {
    if (input.name.includes("/") || input.name.includes("..")) {
      throw new Error(`invalid agent name: ${input.name}`);
    }
    mkdirSync(join(this.root, input.workspaceId, input.name), {
      recursive: true,
    });
    return this.toAgent(input.workspaceId, input.name);
  }

  async renameAgent(id: AgentId, name: string): Promise<Agent> {
    const agent = await this.getAgent(id);
    if (!agent) throw new Error(`renameAgent: unknown agent ${id}`);
    if (name.includes("/") || name.includes(".."))
      throw new Error(`invalid agent name: ${name}`);
    if (name === agent.name) return agent;
    // Check BEFORE renameSync: moving onto an existing directory throws a raw
    // ENOTEMPTY that would surface as a 500 (#172).
    if (existsSync(join(this.root, agent.workspaceId, name)))
      throw new AgentNameConflictError(name);
    renameSync(
      join(this.root, agent.workspaceId, agent.name),
      join(this.root, agent.workspaceId, name),
    );
    return this.toAgent(agent.workspaceId, name);
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
