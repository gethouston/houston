import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { KanbanItem } from "@houston-ai/board";
import { useUIStore } from "../../stores/ui";
import { tauriChat } from "../../lib/tauri";
import { openMissionWorktreeTerminal } from "../../lib/mission-worktree";
import { planNewMission } from "../mission-control-create";
import {
  missionControlAgentPathForSession,
  missionControlSessionKeyForId,
} from "../mission-control-session";
import type { useMissionControl } from "../use-mission-control";
import type { SendOverrides } from "./board-source";
import type { Agent, AgentDefinition } from "../../lib/types";

/**
 * Mission Control's card/composer actions, routed to the right agent. Create
 * resolves the active agent's default mode via {@link planNewMission}; send
 * delegates to `mc.handleSendMessage` (which re-resolves provider/model from
 * the target activity, so composer overrides are intentionally ignored); stop
 * and run-in-terminal resolve their agent from the session / card metadata.
 */
export function useMcActions({
  mc,
  activeAgent,
  activeAgentDef,
}: {
  mc: ReturnType<typeof useMissionControl>;
  activeAgent: Agent | null;
  activeAgentDef: AgentDefinition | null;
}) {
  const { t } = useTranslation(["dashboard", "board"]);
  const addToast = useUIStore((s) => s.addToast);

  const createConversation = useCallback(
    async ({
      text,
      files,
      providerOverride,
      modelOverride,
    }: { text: string; files: File[] } & SendOverrides) => {
      const plan = planNewMission({ activeAgent, activeAgentDef, providerOverride, modelOverride });
      if (plan.kind === "no-agent") {
        addToast({ title: t("dashboard:errors.noAgentForMission"), variant: "error" });
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
    (sessionKey: string, text: string, files: File[], _overrides: SendOverrides) =>
      mc.handleSendMessage(sessionKey, text, files),
    [mc.handleSendMessage],
  );

  const stopSession = useCallback(
    (sessionKey: string) => {
      const agentPath = missionControlAgentPathForSession(mc.items, sessionKey);
      if (!agentPath) return;
      tauriChat.stop(agentPath, sessionKey).catch((err) => {
        addToast({ title: t("dashboard:errors.stopSession", { error: String(err) }), variant: "error" });
      });
    },
    [mc.items, addToast, t],
  );

  const runInTerminal = useCallback(
    async (item: KanbanItem) => {
      const wtPath = item.metadata?.worktreePath as string | undefined;
      const agentPath = item.metadata?.agentPath as string | undefined;
      if (!wtPath || !agentPath) return;
      try {
        await openMissionWorktreeTerminal(agentPath, wtPath);
      } catch (err) {
        addToast({
          title: t("board:cardActions.openTerminalFailed", { error: String(err) }),
          variant: "error",
        });
      }
    },
    [addToast, t],
  );

  const sessionKeyFor = useCallback(
    (activityId: string) => missionControlSessionKeyForId(mc.items, activityId),
    [mc.items],
  );

  return { createConversation, sendMessageNow, stopSession, runInTerminal, sessionKeyFor };
}
