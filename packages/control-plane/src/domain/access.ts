import type { Agent, UserId, Workspace } from "./types";

export type AccessResult = { ok: true } | { ok: false; reason: string };

/**
 * The single access decision, pure and side-effect-free, enforced by the control
 * plane on every request that touches an agent. In the personal tier it is pure
 * ownership: you may use an agent IFF you own the workspace that agent lives in.
 *
 * This decides visibility/access. It is NOT the isolation boundary — that is the
 * per-agent sandbox (one volume, default-deny networking). See cloud/README.md §2.
 */
export function canUseAgent(opts: {
  userId: UserId;
  agent: Agent | null;
  /** The workspace the agent belongs to (looked up by agent.workspaceId). */
  workspace: Workspace | null;
}): AccessResult {
  const { userId, agent, workspace } = opts;

  if (!agent) return { ok: false, reason: "agent not found" };
  if (!workspace || workspace.id !== agent.workspaceId) {
    return { ok: false, reason: "workspace not found" };
  }
  if (workspace.ownerUserId !== userId) {
    return { ok: false, reason: "not your agent" };
  }
  return { ok: true };
}

/** Does this user own this workspace? (Used for agent CRUD, all owner-only today.) */
export function ownsWorkspace(userId: UserId, workspace: Workspace | null): boolean {
  return !!workspace && workspace.ownerUserId === userId;
}
