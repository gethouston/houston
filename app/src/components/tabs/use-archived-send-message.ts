import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import type { Activity } from "../../data/activity";
import { analytics } from "../../lib/analytics";
import { buildAttachmentPrompt } from "../../lib/attachment-message";
import { classifyFileKind } from "../../lib/file-kind";
import { tauriAttachments, tauriChat } from "../../lib/tauri";
import type { AgentDefinition } from "../../lib/types";
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
  const addToast = useUIStore((s) => s.addToast);
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
        // The turn stream pushes the user bubble into the conversation VM
        // itself — no app-side optimistic push.
        await tauriChat.send(agentPath, prompt, sessionKey, {
          mode: mode?.promptFile,
          providerOverride: effectiveProvider,
          modelOverride: effectiveModel,
        });
        analytics.track("chat_message_sent");
        for (const f of files) {
          analytics.track("file_attached", { file_kind: classifyFileKind(f) });
        }
        onReactivated();
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
      agentPath,
      selectedId,
      archived,
      agentDef,
      effectiveProvider,
      effectiveModel,
      onReactivated,
      addToast,
      setViewMode,
      setActivityPanelId,
      t,
    ],
  );
}
