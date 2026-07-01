import type { KanbanItem } from "@houston-ai/board";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { analytics } from "../../lib/analytics";
import { buildAttachmentPrompt } from "../../lib/attachment-message";
import { classifyFileKind } from "../../lib/file-kind";
import { tauriAttachments, tauriChat } from "../../lib/tauri";
import type { Agent, AgentDefinition } from "../../lib/types";
import { useAgentStore } from "../../stores/agents";
import { useFeedStore } from "../../stores/feeds";
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
  const pushFeedItem = useFeedStore((s) => s.pushFeedItem);
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
        await tauriChat.send(agentPath, prompt, sessionKey, {
          mode: mode?.promptFile,
          providerOverride,
          modelOverride,
        });
        pushFeedItem(agentPath, sessionKey, {
          feed_type: "user_message",
          data: prompt,
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
        pushFeedItem(agentPath, sessionKey, {
          feed_type: "system_message",
          data: t("errors.sessionStart", { error: String(err) }),
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
      pushFeedItem,
      setViewMode,
      setActivityPanelId,
      t,
    ],
  );
}
