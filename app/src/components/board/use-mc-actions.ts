import type { KanbanItem } from "@houston-ai/board";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { armMissionDoneCelebration } from "../../lib/mission-done-celebration";
import { canDropMission } from "../../lib/mission-selection";
import { queryKeys } from "../../lib/query-keys";
import { showStopFailedToast } from "../../lib/stop-error-toast";
import { tauriChat } from "../../lib/tauri";
import type { Agent } from "../../lib/types";
import { useUIStore } from "../../stores/ui";
import { missionColumnIdForStatus } from "../mission-board-columns";
import { planNewMission } from "../mission-control-create";
import {
  missionControlAgentPathForSession,
  missionControlSessionKeyForId,
} from "../mission-control-session";
import type { useMissionControl } from "../use-mission-control";
import type { NewConversationArgs, SendOverrides } from "./board-source";
import { editMission, moveFailure } from "./mission-writes";

/**
 * Mission Control's card/composer actions, routed to the right agent. Create
 * resolves the target agent via {@link planNewMission}; send delegates to
 * `mc.handleSendMessage` (which resolves provider/model from the cached
 * target activity, falling back to the composer's pick); stop resolves its
 * agent from the session metadata.
 */
export function useMcActions({
  mc,
  activeAgent,
  paths,
}: {
  mc: ReturnType<typeof useMissionControl>;
  activeAgent: Agent | null;
  /** Every agent path on the view, for query invalidation after a drag-move. */
  paths: string[];
}) {
  const { t } = useTranslation(["dashboard", "board"]);
  const addToast = useUIStore((s) => s.addToast);
  const qc = useQueryClient();

  const mcHandleCreateConversation = mc.handleCreateConversation;
  const createConversation = useCallback(
    async ({
      text,
      files,
      providerOverride,
      modelOverride,
      effortOverride,
      modeOverride,
      mentions,
      conversationId,
    }: NewConversationArgs) => {
      const plan = planNewMission({
        activeAgent,
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
      return mcHandleCreateConversation(plan.agent, text, files, {
        providerOverride: plan.providerOverride,
        modelOverride: plan.modelOverride,
        effortOverride,
        modeOverride,
        mentions,
        conversationId,
      });
    },
    [activeAgent, mcHandleCreateConversation, addToast, t],
  );

  // Cross-agent: the composer's provider/model are the chat panel's pick for
  // the OPEN mission (its row's pin once loaded, the agent default until
  // then); useMissionControl prefers the cached row's own pin and otherwise
  // sends what the picker shows — never a pod read before the bubble.
  const mcHandleSendMessage = mc.handleSendMessage;
  const sendMessageNow = useCallback(
    (
      sessionKey: string,
      text: string,
      files: File[],
      overrides: SendOverrides,
    ) => mcHandleSendMessage(sessionKey, text, files, overrides),
    [mcHandleSendMessage],
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
        .catch(showStopFailedToast);
    },
    [mc.items, qc, paths],
  );

  const sessionKeyFor = useCallback(
    (activityId: string) => missionControlSessionKeyForId(mc.items, activityId),
    [mc.items],
  );

  // Drag a card onto another column to change its status. The dragged card
  // stays with its own agent, only its status moves, and it lands in the
  // target column in the same frame as the drop (`editMission`); the refresh
  // after the write re-reads both the cross-agent board and that agent's own,
  // as the bulk move does. The board only fires this for a column
  // `canDropItem` accepted, so `toColumnId` doubles as the new status. The
  // celebration fires with the drop, like the checkmark's (declining a
  // dragged `error` card is filing, not a win). Full contract in
  // armMissionDoneCelebration.
  const handleItemMove = useCallback(
    (item: KanbanItem, toColumnId: string) => {
      const agentPath = item.metadata?.agentPath as string | undefined;
      if (!agentPath) return;
      const celebrate = armMissionDoneCelebration(item, toColumnId);
      void editMission(
        qc,
        agentPath,
        item,
        { status: toColumnId },
        {
          command: "move_mission",
          failure: moveFailure(item, "move"),
          refresh: [
            queryKeys.allConversations(paths),
            queryKeys.activity(agentPath),
          ],
        },
      );
      celebrate();
    },
    [qc, paths],
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
