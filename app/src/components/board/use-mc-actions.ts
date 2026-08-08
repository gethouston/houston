import type { KanbanItem } from "@houston-ai/board";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { armMissionDoneCelebration } from "../../lib/mission-done-celebration";
import { canDropMission } from "../../lib/mission-selection";
import { queryKeys } from "../../lib/query-keys";
import { tauriActivity, tauriChat } from "../../lib/tauri";
import type { Agent } from "../../lib/types";
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
 * resolves the target agent via {@link planNewMission}; send delegates to
 * `mc.handleSendMessage` (which re-resolves provider/model from the target
 * activity, so composer overrides are intentionally ignored); stop resolves
 * its agent from the session metadata.
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

  const createConversation = useCallback(
    async ({
      text,
      files,
      providerOverride,
      modelOverride,
      mentions,
    }: { text: string; files: File[] } & SendOverrides) => {
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
        mentions,
      });
    },
    [activeAgent, mc.handleCreateConversation, addToast, t],
  );

  // Cross-agent: ignore the composer's provider/model overrides, re-resolve
  // them from the activity (see useMissionControl). `mentions` are NOT an
  // override in that sense — they are what this very message said — so they
  // ride through.
  const sendMessageNow = useCallback(
    (
      sessionKey: string,
      text: string,
      files: File[],
      overrides: SendOverrides,
    ) => mc.handleSendMessage(sessionKey, text, files, overrides.mentions),
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
  // doubles as the new status. Failure surfaces as a toast, and the celebration
  // is armed before the write (measuring the card so the burst comes off it)
  // and fired after it lands — declining a dragged `error` card, which shares
  // the Needs you column but is filing, not a win. Full contract in
  // armMissionDoneCelebration.
  const handleItemMove = useCallback(
    async (item: KanbanItem, toColumnId: string) => {
      const agentPath = item.metadata?.agentPath as string | undefined;
      if (!agentPath) return;
      const celebrate = armMissionDoneCelebration(item, toColumnId);
      try {
        await tauriActivity.update(agentPath, item.id, { status: toColumnId });
        qc.invalidateQueries({ queryKey: queryKeys.allConversations(paths) });
        qc.invalidateQueries({ queryKey: queryKeys.activity(agentPath) });
      } catch (err) {
        addToast({
          title: t("board:dnd.moveError", { error: String(err) }),
          variant: "error",
        });
        return;
      }
      // Outside the try: a throwing celebration must never read as a failed move.
      celebrate();
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
