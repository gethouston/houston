import type { AIBoardProps } from "@houston-ai/board";
import { useCallback, useMemo } from "react";
import { useSessionMessageQueue } from "../../hooks/use-session-message-queue";
import type { SendOverrides } from "./board-source";

/**
 * Follow-up send + queue display shared by both board views.
 *
 * Queue-while-running lives in the engine adapter now (a send into a running
 * conversation is held and flushed as one combined send at settle), so every
 * send here just sends; this hook renders the open conversation's queued
 * bubbles and forwards the remove affordance.
 *
 * `overrides` carry the composer's effective provider/model so the wire
 * mirrors the dropdown; the source decides whether to honor or re-resolve
 * them inside `sendMessageNow`.
 */
export function useBoardSendQueue({
  selectedSessionKey,
  selectedAgentPath,
  overrides,
  sendMessageNow,
}: {
  selectedSessionKey: string | null;
  selectedAgentPath: string | null;
  overrides: SendOverrides;
  sendMessageNow: (
    sessionKey: string,
    text: string,
    files: File[],
    overrides: SendOverrides,
  ) => Promise<void>;
}) {
  const sendSelectedNow = useCallback(
    async (text: string, files: File[]) => {
      if (!selectedSessionKey) return;
      await sendMessageNow(selectedSessionKey, text, files, overrides);
    },
    [selectedSessionKey, sendMessageNow, overrides],
  );

  const messageQueue = useSessionMessageQueue({
    agentPath: selectedAgentPath,
    sessionKey: selectedSessionKey,
    sendNow: sendSelectedNow,
  });

  const handleSendMessage = useCallback(
    async (sessionKey: string, text: string, files: File[]) => {
      await sendMessageNow(sessionKey, text, files, overrides);
    },
    [sendMessageNow, overrides],
  );

  const queuedMessages = useMemo<AIBoardProps["queuedMessages"]>(
    () =>
      selectedSessionKey
        ? { [selectedSessionKey]: messageQueue.queuedMessages }
        : {},
    [selectedSessionKey, messageQueue.queuedMessages],
  );

  const onRemoveQueuedMessage = useCallback(
    (_sessionKey: string, id: string) => messageQueue.removeQueuedMessage(id),
    [messageQueue.removeQueuedMessage],
  );

  return {
    handleSendMessage,
    queuedMessages,
    onRemoveQueuedMessage,
  };
}
