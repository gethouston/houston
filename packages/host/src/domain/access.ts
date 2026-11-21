import type { Agent, UserId, Workspace } from "./types";

export type AccessResult = { ok: true } | { ok: false; reason: string };

export function canUseAgent(opts: {
  userId: UserId;
  agent: Agent | null;
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

export function ownsWorkspace(
  userId: UserId,
  workspace: Workspace | null,
): boolean {
  return !!workspace && workspace.ownerUserId === userId;
}
