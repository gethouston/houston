import type { KanbanItem } from "@houston-ai/board";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { analytics } from "../../lib/analytics";
import { buildAttachmentPrompt } from "../../lib/attachment-message";
import { classifyFileKind } from "../../lib/file-kind";
import { tauriAttachments, tauriChat, tauriConfig } from "../../lib/tauri";
import { readAgentTurnMode } from "../../lib/turn-mode";
import type { Agent, AgentDefinition } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";

/**
 * Send-to-reactivate for the cross-agent Archived view — the analogue of the
 * per-agent `useArchivedSendMessage`. Sending in an archived chat re-activates
 * the mission (the engine flips `archived → running` on session start) and
 * hands off to that mission's agent board with the chat open. The target is
 * always the selected archived mission, whose agent is `activeAgent`.
 */
export function useMissionControlArchivedSend({
  activeAgent,
  activeAgentDef,
  selectedItem,
  providerOverride,
  modelOverride,
  onReactivated,
}: {
  activeAgent: Agent | null;
  activeAgentDef: AgentDefinition | null;
  selectedItem: KanbanItem | null;
  providerOverride: string;
  modelOverride: string;
  onReactivated: () => void;
}) {
  const { t } = useTranslation("chat");
  const addToast = useUIStore((s) => s.addToast);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const setActivityPanelId = useUIStore((s) => s.setActivityPanelId);

  return useCallback(
    async (sessionKey: string, text: string, files: File[]) => {
      if (!activeAgent || !selectedItem) return;
      const agentPath = activeAgent.folderPath;
      const missionId = selectedItem.id;
      const mode = activeAgentDef?.config.agents?.find(
        (m) => m.id === (selectedItem.metadata?.agent as string | undefined),
      );
      try {
        const paths = await tauriAttachments.save(
          `activity-${missionId}`,
          files,
        );
        const prompt = buildAttachmentPrompt(text, files, paths);
        // The turn stream pushes the user bubble into the conversation VM
        // itself — no app-side optimistic push.
        await tauriChat.send(agentPath, prompt, sessionKey, {
          mode: mode?.promptFile,
          providerOverride,
          modelOverride,
          modeOverride: await readAgentTurnMode(agentPath, tauriConfig.read),
        });
        analytics.track("chat_message_sent");
        for (const f of files)
          analytics.track("file_attached", { file_kind: classifyFileKind(f) });
        // Reactivated (archived → running): hand off to the agent's board.
        onReactivated();
        useAgentStore.getState().setCurrent(activeAgent);
        setViewMode("activity");
        setActivityPanelId(missionId, { forceOpen: true });
      } catch (err) {
        // The send failed BEFORE a turn stream existed — nothing wrote to the
        // VM, so surface it as a toast (no-silent-failures rule).
        addToast({
          title: t("errors.sessionStart", { error: String(err) }),
          variant: "error",
        });
        throw err;
      }
    },
    [
      activeAgent,
      activeAgentDef,
      selectedItem,
      providerOverride,
      modelOverride,
      onReactivated,
      addToast,
      setViewMode,
      setActivityPanelId,
      t,
    ],
  );
}
