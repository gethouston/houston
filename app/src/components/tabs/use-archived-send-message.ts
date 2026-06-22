import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import type { Activity } from "../../data/activity";
import type { AgentDefinition } from "../../lib/types";
import { analytics } from "../../lib/analytics";
import { buildAttachmentPrompt } from "../../lib/attachment-message";
import { classifyFileKind } from "../../lib/file-kind";
import { tauriAttachments, tauriChat } from "../../lib/tauri";
import { useFeedStore } from "../../stores/feeds";
import { useUIStore } from "../../stores/ui";

interface ArchivedSendMessageOptions {
  agentPath: string;
  selectedId: string | null;
  archived: Activity[];
  agentDef: AgentDefinition;
  effectiveProvider: string;
  effectiveModel: string;
  onReactivated: () => void;
}

export function useArchivedSendMessage({
  agentPath,
  selectedId,
  archived,
  agentDef,
  effectiveProvider,
  effectiveModel,
  onReactivated,
}: ArchivedSendMessageOptions) {
  const { t } = useTranslation("chat");
  const pushFeedItem = useFeedStore((s) => s.pushFeedItem);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const setActivityPanelId = useUIStore((s) => s.setActivityPanelId);

  return useCallback(
    async (sessionKey: string, text: string, files: File[]) => {
      const missionId = selectedId ?? sessionKey.replace(/^activity-/, "");
      const activity = archived.find((a) => a.id === missionId);
      const mode = agentDef.config.agents?.find(
        (m) => m.id === activity?.agent,
      );

      try {
        const paths = await tauriAttachments.save(
          `activity-${missionId}`,
          files,
        );
        const prompt = buildAttachmentPrompt(text, files, paths);
        await tauriChat.send(agentPath, prompt, sessionKey, {
          mode: mode?.promptFile,
          providerOverride: effectiveProvider,
          modelOverride: effectiveModel,
        });
        pushFeedItem(agentPath, sessionKey, {
          feed_type: "user_message",
          data: prompt,
        });
        analytics.track("chat_message_sent");
        for (const f of files) {
          analytics.track("file_attached", { file_kind: classifyFileKind(f) });
        }
        onReactivated();
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
      agentPath,
      selectedId,
      archived,
      agentDef,
      effectiveProvider,
      effectiveModel,
      onReactivated,
      pushFeedItem,
      setViewMode,
      setActivityPanelId,
      t,
    ],
  );
}
