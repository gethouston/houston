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

export function useMcActions({
  mc,
  activeAgent,
  paths,
}: {
  mc: ReturnType<typeof useMissionControl>;
  activeAgent: Agent | null;
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
      return mc.handleCreateConversation(plan.agent, text, files, {
        providerOverride: plan.providerOverride,
        modelOverride: plan.modelOverride,
        effortOverride,
        modeOverride,
        mentions,
        conversationId,
      });
    },
    [activeAgent, mc.handleCreateConversation, addToast, t],
  );

  const sendMessageNow = useCallback(
    (
      sessionKey: string,
      text: string,
      files: File[],
      overrides: SendOverrides,
    ) => mc.handleSendMessage(sessionKey, text, files, overrides),
    [mc.handleSendMessage],
  );

  const stopSession = useCallback(
    (sessionKey: string) => {
      const agentPath = missionControlAgentPathForSession(mc.items, sessionKey);
      if (!agentPath) return;
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
