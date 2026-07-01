import type { KanbanItem } from "@houston-ai/board";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { canDropMission } from "../../lib/mission-selection";
import { queryKeys } from "../../lib/query-keys";
import { tauriActivity, tauriChat } from "../../lib/tauri";
import type { Agent, AgentDefinition } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { missionColumnIdForStatus } from "../mission-board-columns";
import { planNewMission } from "../mission-control-create";
import {
  missionControlAgentPathForSession,
  missionControlSessionKeyForId,
} from "../mission-control-session";
import type { useMissionControl } from "../use-mission-control";
import type { SendOverrides } from "./board-source";

/**
 * Mission Control's card/composer actions, routed to the right agent. Create
 * resolves the active agent's default mode via {@link planNewMission}; send
 * delegates to `mc.handleSendMessage` (which re-resolves provider/model from
 * the target activity, so composer overrides are intentionally ignored); stop
 * resolves its agent from the session metadata.
 */
export function useMcActions({
  mc,
  activeAgent,
  activeAgentDef,
  paths,
}: {
  mc: ReturnType<typeof useMissionControl>;
  activeAgent: Agent | null;
  activeAgentDef: AgentDefinition | null;
  /** Every agent path on the view, for query invalidation after a drag-move. */
  paths: string[];
}) {
  const { t } = useTranslation(["dashboard", "board"]);
  const addToast = useUIStore((s) => s.addToast);
  const qc = useQueryClient();

  const createConversation = useCallback(
    async ({
      text,
      files,
      providerOverride,
      modelOverride,
    }: { text: string; files: File[] } & SendOverrides) => {
      const plan = planNewMission({
        activeAgent,
        activeAgentDef,
        providerOverride,
        modelOverride,
      });
      if (plan.kind === "no-agent") {
        addToast({
          title: t("dashboard:errors.noAgentForMission"),
          variant: "error",
        });
        throw new Error("New mission submitted with no active agent");
      }
      return mc.handleCreateConversation(plan.agent, text, files, {
        agentMode: plan.agentMode,
        promptFile: plan.promptFile,
        providerOverride: plan.providerOverride,
        modelOverride: plan.modelOverride,
      });
    },
    [activeAgent, activeAgentDef, mc.handleCreateConversation, addToast, t],
  );

  // Cross-agent: ignore composer overrides, re-resolve from the activity (see
  // useMissionControl). 4th param keeps the BoardSource signature aligned.
  const sendMessageNow = useCallback(
    (
      sessionKey: string,
      text: string,
      files: File[],
      _overrides: SendOverrides,
    ) => mc.handleSendMessage(sessionKey, text, files),
    [mc.handleSendMessage],
  );

  const stopSession = useCallback(
    (sessionKey: string) => {
      const agentPath = missionControlAgentPathForSession(mc.items, sessionKey);
      if (!agentPath) return;
      // Refetch on success so a card the engine settled off "running" (an
      // orphaned turn with no live turn to abort) actually leaves the spinner;
      // a failed stop still surfaces as a toast.
      tauriChat
        .stop(agentPath, sessionKey)
        .then(() => {
          qc.invalidateQueries({ queryKey: queryKeys.activity(agentPath) });
          qc.invalidateQueries({
            queryKey: queryKeys.allConversations(paths),
          });
        })
        .catch((err) => {
          addToast({
            title: t("dashboard:errors.stopSession", { error: String(err) }),
            variant: "error",
          });
        });
    },
    [mc.items, qc, paths, addToast, t],
  );

  const sessionKeyFor = useCallback(
    (activityId: string) => missionControlSessionKeyForId(mc.items, activityId),
    [mc.items],
  );

  // Drag a card onto another column to change its status. The dragged card
  // stays with its own agent — only its status moves — so this routes the
  // update to that card's agent path and refreshes both the cross-agent board
  // and that agent's own board (matching the cross-agent bulk move). The board
  // only fires this for a column `canDropItem` accepted, so `toColumnId`
  // doubles as the new status. Failure surfaces as a toast.
  const handleItemMove = useCallback(
    async (item: KanbanItem, toColumnId: string) => {
      const agentPath = item.metadata?.agentPath as string | undefined;
      if (!agentPath) return;
      try {
        await tauriActivity.update(agentPath, item.id, { status: toColumnId });
        qc.invalidateQueries({ queryKey: queryKeys.allConversations(paths) });
        qc.invalidateQueries({ queryKey: queryKeys.activity(agentPath) });
      } catch (err) {
        addToast({
          title: t("board:dnd.moveError", { error: String(err) }),
          variant: "error",
        });
      }
    },
    [qc, paths, addToast, t],
  );
  // A card can be dropped on a column iff the shared mission rule allows it:
  // only needs_you / done, and never its current section. Agent-agnostic.
  const canDropItem = useCallback(
    (item: KanbanItem, toColumnId: string) =>
      canDropMission(missionColumnIdForStatus(item.status), toColumnId),
    [],
  );

  return {
    createConversation,
    sendMessageNow,
    stopSession,
    sessionKeyFor,
    handleItemMove,
    canDropItem,
  };
}
