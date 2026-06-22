import type { QueuedChatMessage as QueuedChatMessageView } from "@houston-ai/chat";
import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  combineQueuedMessageFiles,
  combineQueuedMessageText,
} from "../lib/queued-chat";
import {
  useQueuedMessageStore,
  useQueuedMessages,
} from "../stores/queued-messages";

interface UseSessionMessageQueueArgs {
  agentPath: string | null;
  sessionKey: string | null;
  isActive: boolean;
  sendNow: (text: string, files: File[]) => Promise<void> | void;
  onQueued?: () => void;
}

export function useSessionMessageQueue({
  agentPath,
  sessionKey,
  isActive,
  sendNow,
  onQueued,
}: UseSessionMessageQueueArgs) {
  const queued = useQueuedMessages(agentPath, sessionKey);
  const enqueue = useQueuedMessageStore((state) => state.enqueue);
  const remove = useQueuedMessageStore((state) => state.remove);
  const takeAll = useQueuedMessageStore((state) => state.takeAll);
  const flushingRef = useRef(false);

  const queueMessage = useCallback(
    (text: string, files: File[]) => {
      if (!agentPath || !sessionKey) return false;
      enqueue(agentPath, sessionKey, text, files);
      onQueued?.();
      return true;
    },
    [agentPath, sessionKey, enqueue, onQueued],
  );

  const removeQueuedMessage = useCallback(
    (id: string) => {
      if (!agentPath || !sessionKey) return;
      remove(agentPath, sessionKey, id);
    },
    [agentPath, sessionKey, remove],
  );

  const sendOrQueue = useCallback(
    async (text: string, files: File[]) => {
      if (isActive || flushingRef.current) {
        queueMessage(text, files);
        return;
      }
      await sendNow(text, files);
    },
    [isActive, queueMessage, sendNow],
  );

  useEffect(() => {
    if (!agentPath || !sessionKey || isActive || queued.length === 0) return;
    if (flushingRef.current) return;
    const items = takeAll(agentPath, sessionKey);
    if (items.length === 0) return;
    const text = combineQueuedMessageText(items);
    const files = combineQueuedMessageFiles(items);
    flushingRef.current = true;
    void Promise.resolve(sendNow(text, files)).finally(() => {
      flushingRef.current = false;
    });
  }, [agentPath, sessionKey, isActive, queued.length, takeAll, sendNow]);

  const queuedMessages = useMemo<QueuedChatMessageView[]>(
    () =>
      queued.map((item) => ({
        id: item.id,
        text: item.text,
        attachmentNames: item.files.map((file) => file.name),
      })),
    [queued],
  );

  return {
    queuedMessages,
    queueMessage,
    removeQueuedMessage,
    sendOrQueue,
  };
}
