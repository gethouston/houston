import type { SidebarLayout } from "@houston/engine-adapter";
import { postscriptDone, type TeamMoveState } from "./move-team.ts";
import type { PendingTeamMove } from "./pending-team-move.ts";
import { deleteGroupOp } from "./sidebar-layout-group-ops.ts";

export interface TeamMoveStageWire {
  targetWorkspaceId(slug: string): Promise<string>;
  getLayout(workspaceId: string): Promise<SidebarLayout>;
  updateLayout(
    workspaceId: string,
    op: (layout: SidebarLayout) => SidebarLayout,
  ): Promise<SidebarLayout>;
  switchTarget(slug: string): Promise<void>;
}

export function targetFolderLayout(
  layout: SidebarLayout,
  pending: PendingTeamMove,
): SidebarLayout {
  const source = pending.sourceTeam;
  const moved = new Set(pending.agentIds);
  const agentIds = [
    ...new Set([
      ...(layout.groups.find((group) => group.id === pending.targetGroupId)
        ?.agentIds ?? []),
      ...pending.agentIds,
    ]),
  ];
  const target = layout.groups.find(
    (group) => group.id === pending.targetGroupId,
  );
  if (target && target.name !== source.name)
    throw new Error("target folder id belongs to another folder");
  return {
    groups: target
      ? layout.groups.map((group) =>
          group.id === target.id
            ? { ...group, agentIds }
            : {
                ...group,
                agentIds: group.agentIds.filter((id) => !moved.has(id)),
              },
        )
      : [
          ...layout.groups.map((group) => ({
            ...group,
            agentIds: group.agentIds.filter((id) => !moved.has(id)),
          })),
          {
            id: pending.targetGroupId,
            name: source.name,
            collapsed: false,
            agentIds,
            ...(source.icon ? { icon: source.icon } : {}),
            ...(source.color ? { color: source.color } : {}),
          },
        ],
    order: [
      ...(target
        ? []
        : [{ kind: "group" as const, id: pending.targetGroupId }]),
      ...layout.order.filter(
        (entry) => entry.kind !== "agent" || !moved.has(entry.id),
      ),
    ],
  };
}

export function sourceAfterFolderMove(
  layout: SidebarLayout,
  pending: PendingTeamMove,
): SidebarLayout {
  const moved = new Set(pending.agentIds);
  return deleteGroupOp(
    {
      groups: layout.groups.map((group) => ({
        ...group,
        agentIds: group.agentIds.filter((id) => !moved.has(id)),
      })),
      order: layout.order.filter(
        (entry) => entry.kind !== "agent" || !moved.has(entry.id),
      ),
    },
    pending.sourceTeam.id,
  );
}

export async function runTeamMoveStage(
  state: TeamMoveState,
  pending: PendingTeamMove,
  wire: TeamMoveStageWire,
): Promise<TeamMoveState> {
  if (state.step === "createTarget") {
    const workspaceId = await wire.targetWorkspaceId(pending.targetSlug);
    await wire.getLayout(workspaceId);
    await wire.updateLayout(workspaceId, (layout) =>
      targetFolderLayout(layout, pending),
    );
    return postscriptDone(state);
  }
  if (state.step === "cleanupSource") {
    const workspaceId = pending.sourceTeam.workspaceId;
    await wire.getLayout(workspaceId);
    await wire.updateLayout(workspaceId, (layout) =>
      sourceAfterFolderMove(layout, pending),
    );
    return postscriptDone(state);
  }
  if (state.step === "switching") {
    await wire.switchTarget(pending.targetSlug);
    return postscriptDone(state);
  }
  return state;
}

export async function runTeamMovePostscript(
  pending: PendingTeamMove,
  wire: TeamMoveStageWire,
  onProgress: (state: TeamMoveState) => void,
): Promise<void> {
  let state: TeamMoveState = {
    step: pending.postscriptStage ?? "createTarget",
    target: { slug: pending.targetSlug, name: pending.targetName },
  };
  while (state.step !== "invite") {
    onProgress(state);
    state = await runTeamMoveStage(state, pending, wire);
    onProgress(state);
  }
}
