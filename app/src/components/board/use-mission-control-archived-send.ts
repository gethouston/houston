import type { KanbanItem } from "@houston-ai/board";
import type { MessageMention } from "@houston-ai/chat";
import { useCallback } from "react";
import { analytics } from "../../lib/analytics";
import { buildAttachmentPrompt } from "../../lib/attachment-message";
import { classifyFileKind } from "../../lib/file-kind";
import type { ModelPin } from "../../lib/model-selector-lock";
import { showSendFailedToast } from "../../lib/send-error-toast";
import { tauriAttachments, tauriChat } from "../../lib/tauri";
import type { TurnMode } from "../../lib/turn-mode";
import type { Agent } from "../../lib/types";

export function useMissionControlArchivedSend({
  activeAgent,
  selectedItem,
  resolveSendPin,
  turnMode,
  onHandoff,
}: {
  activeAgent: Agent | null;
  selectedItem: KanbanItem | null;
  resolveSendPin: () => Promise<ModelPin>;
  turnMode: TurnMode;
  onHandoff: (missionId: string) => void;
}) {
  return useCallback(
    async (
      sessionKey: string,
      text: string,
      files: File[],
      mentions?: MessageMention[],
    ) => {
      if (!activeAgent || !selectedItem) return;
      const agentPath = activeAgent.folderPath;
      const missionId = selectedItem.id;
      try {
        const paths = await tauriAttachments.save(
          agentPath,
          `activity-${missionId}`,
          files,
        );
        const prompt = buildAttachmentPrompt(text, files, paths);
        const pin = await resolveSendPin();
        await tauriChat.send(agentPath, prompt, sessionKey, {
          providerOverride: pin.provider,
          modelOverride: pin.model,
          effortOverride: pin.effort,
          modeOverride: turnMode,
          mentions,
        });
        analytics.track("chat_message_sent", {
          provider: pin.provider,
          model: pin.model,
        });
        for (const f of files)
          analytics.track("file_attached", { file_kind: classifyFileKind(f) });
        onHandoff(missionId);
      } catch (err) {
        showSendFailedToast(err);
        throw err;
      }
    },
    [activeAgent, selectedItem, resolveSendPin, turnMode, onHandoff],
  );
}
