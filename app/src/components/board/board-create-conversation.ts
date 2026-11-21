import type { QueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { analytics } from "../../lib/analytics";
import { buildAttachmentPrompt } from "../../lib/attachment-message";
import { createMission } from "../../lib/create-mission";
import { classifyFileKind } from "../../lib/file-kind";
import { maybeShowFirstMissionPrompt } from "../../lib/notification-nudge";
import { queryKeys } from "../../lib/query-keys";
import { formatVisibleMessageText } from "../../lib/queued-chat";
import { tauriAttachments } from "../../lib/tauri";
import type { ToastItem } from "../../stores/ui";
import type { NewConversationArgs } from "./board-source";

export interface CreateBoardConversationDeps {
  path: string;
  agentId: string;
  agentName: string;
  agentColor?: string;
  queryClient: QueryClient;
  addToast: (toast: Omit<ToastItem, "id">) => void;
  t: TFunction<["board", "chat", "common"]>;
  setSessionLoading: (sessionKey: string, loading: boolean) => void;
}

export async function createBoardConversation(
  deps: CreateBoardConversationDeps,
  {
    text,
    files,
    providerOverride,
    modelOverride,
    effortOverride,
    modeOverride,
    mentions,
    conversationId: claimedId,
  }: NewConversationArgs,
): Promise<string> {
  const {
    path,
    agentId,
    agentName,
    agentColor,
    queryClient,
    addToast,
    t,
    setSessionLoading,
  } = deps;
  const visible = formatVisibleMessageText(text, files, (names) =>
    t("chat:queue.attached", { names }),
  );
  const { conversationId, sessionKey } = await createMission(
    {
      id: agentId,
      name: agentName,
      color: agentColor,
      folderPath: path,
    },
    text,
    {
      providerOverride,
      modelOverride,
      effortOverride,
      modeOverride,
      mentions,
      conversationId: claimedId,
      titleText: visible,
      buildPrompt: async (activityId) => {
        const saved = await tauriAttachments.save(
          path,
          `activity-${activityId}`,
          files,
        );
        return buildAttachmentPrompt(text, files, saved);
      },
      optimistic: true,
    },
  );
  setSessionLoading(sessionKey, true);
  void maybeShowFirstMissionPrompt({ addToast, t });
  queryClient.invalidateQueries({ queryKey: queryKeys.activity(path) });
  analytics.track("mission_created", {
    provider: providerOverride,
    model: modelOverride,
  });
  analytics.track("chat_message_sent", {
    provider: providerOverride,
    model: modelOverride,
  });
  for (const f of files)
    analytics.track("file_attached", { file_kind: classifyFileKind(f) });
  return conversationId;
}
