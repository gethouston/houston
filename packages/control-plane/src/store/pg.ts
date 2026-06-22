import type { Pool } from "pg";
import type { WorkspaceStore } from "../ports";
import type {
  Agent,
  AgentId,
  UserId,
  Workspace,
  WorkspaceId,
  WorkspaceRuntime,
} from "../domain/types";

/** DNS-safe slug for a workspace (used for the K8s namespace). Matches MemoryWorkspaceStore. */
function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "workspace"
  );
}

let seq = 0;
/** Process-local id minter, mirroring MemoryWorkspaceStore's scheme. */
function mintId(prefix: string): string {
  seq += 1;
  return `${prefix}_${seq.toString(36)}${Date.now().toString(36)}`;
}

/** Row shapes as returned by Postgres (snake_case; created_at is bigint → string). */
interface WorkspaceRow {
  id: string;
  owner_user_id: string;
  kind: string;
  name: string;
  slug: string;
  runtime: string;
  created_at: string;
}
interface AgentRow {
  id: string;
  workspace_id: string;
  name: string;
  created_at: string;
}

function toWorkspace(r: WorkspaceRow): Workspace {
  if (r.kind !== "personal" && r.kind !== "org") {
    // The CHECK constraint guarantees this; a mismatch is a corrupted row, not
    // a user error — surface it loudly rather than coercing to a default.
    throw new Error(`invalid workspace kind in row: ${r.kind}`);
  }
  if (r.runtime !== "gke" && r.runtime !== "cloudrun") {
    throw new Error(`invalid workspace runtime in row: ${r.runtime}`);
  }
  return {
    id: r.id,
    ownerUserId: r.owner_user_id,
    kind: r.kind,
    name: r.name,
    slug: r.slug,
    runtime: r.runtime,
    createdAt: Number(r.created_at),
  };
}

function toAgent(r: AgentRow): Agent {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    createdAt: Number(r.created_at),
  };
}

/**
 * Postgres-backed WorkspaceStore. Semantics match MemoryWorkspaceStore exactly;
 * the only difference is durability. Every query is parameterized ($n
 * placeholders) — no caller input is ever interpolated into SQL text.
 *
 * Integration-only: exercising this needs a live Postgres with the
 * cloud_workspaces migration applied. The unit test (pg.test.ts) asserts SQL
 * shape without connecting.
 */
export class PgWorkspaceStore implements WorkspaceStore {
  constructor(
    private readonly pool: Pool,
    private readonly opts: { defaultRuntime?: WorkspaceRuntime } = {},
  ) {}

  async getOrCreatePersonalWorkspace(userId: UserId): Promise<Workspace> {
    // Fast path: the user's existing personal workspace.
    const existing = await this.pool.query<WorkspaceRow>(
      `SELECT id, owner_user_id, kind, name, slug, runtime, created_at
         FROM workspaces
        WHERE owner_user_id = $1 AND kind = 'personal'`,
      [userId],
    );
    const found = existing.rows[0];
    if (found) return toWorkspace(found);

    // None yet: insert one. The UNIQUE partial index on (owner_user_id) WHERE
    // kind='personal' makes this race-safe — a concurrent insert collides on the
    // constraint and we re-read the winner's row.
    const ws: Workspace = {
      id: mintId("ws"),
      ownerUserId: userId,
      kind: "personal",
      name: "Personal",
      slug: slugify(userId),
      runtime: this.opts.defaultRuntime ?? "gke",
      createdAt: Date.now(),
    };
    const inserted = await this.pool.query<WorkspaceRow>(
      `INSERT INTO workspaces (id, owner_user_id, kind, name, slug, runtime, created_at)
         VALUES ($1, $2, 'personal', $3, $4, $5, $6)
       ON CONFLICT (owner_user_id) WHERE kind = 'personal'
       DO NOTHING
       RETURNING id, owner_user_id, kind, name, slug, runtime, created_at`,
      [ws.id, ws.ownerUserId, ws.name, ws.slug, ws.runtime, ws.createdAt],
    );
    const row = inserted.rows[0];
    if (row) return toWorkspace(row);

    // ON CONFLICT DO NOTHING returned no row: a concurrent caller won the race.
    // Re-read their workspace — it must exist now.
    const after = await this.pool.query<WorkspaceRow>(
      `SELECT id, owner_user_id, kind, name, slug, runtime, created_at
         FROM workspaces
        WHERE owner_user_id = $1 AND kind = 'personal'`,
      [userId],
    );
    const winner = after.rows[0];
    if (!winner) {
      throw new Error(
        `getOrCreatePersonalWorkspace: insert was a no-op but no personal workspace exists for ${userId}`,
      );
    }
    return toWorkspace(winner);
  }

  async getWorkspace(id: WorkspaceId): Promise<Workspace | null> {
    const res = await this.pool.query<WorkspaceRow>(
      "SELECT id, owner_user_id, kind, name, slug, runtime, created_at FROM workspaces WHERE id = $1",
      [id],
    );
    const row = res.rows[0];
    return row ? toWorkspace(row) : null;
  }

  async getAgent(id: AgentId): Promise<Agent | null> {
    const res = await this.pool.query<AgentRow>(
      "SELECT id, workspace_id, name, created_at FROM agents WHERE id = $1",
      [id],
    );
    const row = res.rows[0];
    return row ? toAgent(row) : null;
  }

  async listAgents(workspaceId: WorkspaceId): Promise<Agent[]> {
    const res = await this.pool.query<AgentRow>(
      "SELECT id, workspace_id, name, created_at FROM agents WHERE workspace_id = $1",
      [workspaceId],
    );
    return res.rows.map(toAgent);
  }

  async listWorkspaces(): Promise<Workspace[]> {
    const res = await this.pool.query<WorkspaceRow>(
      "SELECT id, owner_user_id, kind, name, slug, runtime, created_at FROM workspaces ORDER BY created_at ASC",
    );
    return res.rows.map(toWorkspace);
  }

  async listWorkspacesForUser(userId: UserId): Promise<Workspace[]> {
    const res = await this.pool.query<WorkspaceRow>(
      "SELECT id, owner_user_id, kind, name, slug, runtime, created_at FROM workspaces WHERE owner_user_id = $1 ORDER BY created_at ASC",
      [userId],
    );
    return res.rows.map(toWorkspace);
  }

  async listAllAgents(): Promise<Agent[]> {
    const res = await this.pool.query<AgentRow>(
      "SELECT id, workspace_id, name, created_at FROM agents ORDER BY created_at ASC",
    );
    return res.rows.map(toAgent);
  }

  async createAgent(input: {
    workspaceId: WorkspaceId;
    name: string;
  }): Promise<Agent> {
    const agent: Agent = {
      id: mintId("agent"),
      workspaceId: input.workspaceId,
      name: input.name,
      createdAt: Date.now(),
    };
    await this.pool.query(
      "INSERT INTO agents (id, workspace_id, name, created_at) VALUES ($1, $2, $3, $4)",
      [agent.id, agent.workspaceId, agent.name, agent.createdAt],
    );
    return agent;
  }

  async renameAgent(id: AgentId, name: string): Promise<Agent> {
    const res = await this.pool.query<AgentRow>(
      `UPDATE agents SET name = $2 WHERE id = $1
       RETURNING id, workspace_id, name, created_at`,
      [id, name],
    );
    const row = res.rows[0];
    if (!row) throw new Error(`renameAgent: unknown agent ${id}`);
    return toAgent(row);
  }

  async setWorkspaceRuntime(
    id: WorkspaceId,
    runtime: WorkspaceRuntime,
  ): Promise<Workspace> {
    const res = await this.pool.query<WorkspaceRow>(
      `UPDATE workspaces SET runtime = $2 WHERE id = $1
       RETURNING id, owner_user_id, kind, name, slug, runtime, created_at`,
      [id, runtime],
    );
    const row = res.rows[0];
    if (!row) throw new Error(`setWorkspaceRuntime: unknown workspace ${id}`);
    return toWorkspace(row);
  }

  async deleteAgent(id: AgentId): Promise<void> {
    const res = await this.pool.query("DELETE FROM agents WHERE id = $1", [id]);
    // pg sets rowCount to the number of affected rows (or null for commands that
    // don't report one). Anything other than a positive count means the agent was
    // never deleted — surface it rather than silently succeeding.
    if (!res.rowCount || res.rowCount < 1) {
      throw new Error(`deleteAgent: unknown agent ${id}`);
    }
  }
}
