/**
 * The control-plane tenancy model — deliberately small for the free personal tier.
 *
 *   Workspace — a user's container of agents. Today every workspace is `personal`:
 *               free, single-player. Its owner sees and uses ALL its agents; nobody
 *               else can. The paid multiplayer "org" kind (members + per-seat) is
 *               modeled by `kind` but NOT implemented yet.
 *   Agent     — belongs to one workspace; maps to exactly one sandbox + one volume.
 *
 * There is no permission/grant layer in personal mode: access is pure ownership
 * (do you own this agent's workspace?). The wall BETWEEN agents is the per-agent
 * sandbox (its own volume + default-deny networking), never a row in a table.
 */

export type WorkspaceId = string;
export type UserId = string; // Supabase user id ("sub")
export type AgentId = string;

/** `personal` = free, single-player (built). `org` = paid, multiplayer (future). */
export type WorkspaceKind = "personal" | "org";

/**
 * Where this workspace's agents execute.
 *   `gke`      — legacy: one long-lived pod + PVC per agent.
 *   `cloudrun` — per-turn Cloud Run + object-storage workspaces (the default
 *                for new workspaces; existing ones flip after PVC→GCS migration).
 */
export type WorkspaceRuntime = "gke" | "cloudrun";

export interface Workspace {
  id: WorkspaceId;
  /** The Supabase user who owns this workspace. For `personal`, the sole member. */
  ownerUserId: UserId;
  kind: WorkspaceKind;
  name: string;
  /** DNS-safe slug; the K8s namespace that holds this workspace's agent sandboxes. */
  slug: string;
  runtime: WorkspaceRuntime;
  createdAt: number;
}

export interface Agent {
  id: AgentId;
  workspaceId: WorkspaceId;
  name: string;
  createdAt: number;
}
