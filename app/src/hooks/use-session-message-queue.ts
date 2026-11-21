import type { QueuedChatMessage as QueuedChatMessageView } from "@houston-ai/chat";
import { useCallback, useMemo } from "react";
import { tauriChat } from "../lib/tauri";
import { useConversationVm } from "./use-conversation-vm";

interface UseSessionMessageQueueArgs {
  agentPath: string | null;
  sessionKey: string | null;
  sendNow: (text: string, files: File[]) => Promise<void> | void;
}

export function useSessionMessageQueue({
  agentPath,
  sessionKey,
  sendNow,
}: UseSessionMessageQueueArgs) {
  const vm = useConversationVm(agentPath, sessionKey);

  const queuedMessages = useMemo<QueuedChatMessageView[]>(
    () =>
      (vm?.queued ?? []).map((item) => ({
        id: item.id,
        text: item.text,
        attachmentNames: item.attachmentNames ?? [],
      })),
    [vm],
  );

  const removeQueuedMessage = useCallback(
    (id: string) => {
      if (!agentPath || !sessionKey) return;
      tauriChat.removeQueued(agentPath, sessionKey, id);
    },
    [agentPath, sessionKey],
  );

  const sendOrQueue = useCallback(
    async (text: string, files: File[]) => {
      await sendNow(text, files);
    },
    [sendNow],
  );

  return {
    queuedMessages,
    removeQueuedMessage,
    sendOrQueue,
  };
}
