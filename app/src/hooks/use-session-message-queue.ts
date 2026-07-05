import type { QueuedChatMessage as QueuedChatMessageView } from "@houston-ai/chat";
import { useCallback, useMemo } from "react";
import { tauriChat } from "../lib/tauri";
import { useConversationVm } from "./use-conversation-vm";

interface UseSessionMessageQueueArgs {
  agentPath: string | null;
  sessionKey: string | null;
  sendNow: (text: string, files: File[]) => Promise<void> | void;
}

/**
 * The composer's view of a conversation's send queue. Queueing itself lives in
 * the engine adapter (a send into a running conversation is held and flushed
 * as one combined send at settle — see `engine-adapter/send-queue.ts`), so
 * every send path inherits it; this hook only renders the queued bubbles from
 * the conversation VM and forwards the remove affordance.
 */
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

  // The adapter decides queue-vs-dispatch; callers just send.
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
