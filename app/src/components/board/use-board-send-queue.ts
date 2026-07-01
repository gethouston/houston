import type { AIBoardProps } from "@houston-ai/board";
import { useCallback, useMemo } from "react";
import { useSessionMessageQueue } from "../../hooks/use-session-message-queue";
import type { SendOverrides } from "./board-source";

type ComposerSubmit = NonNullable<AIBoardProps["onComposerSubmit"]>;

/**
 * Follow-up send + queue wiring shared by both board views.
 *
 * Messages typed at the open conversation while it's still running are
 * queued (and auto-flushed when it settles); messages to any other session
 * send immediately. A composer submit fired while the open session is active
 * is captured as a queued message before the panel hook (Skills) sees it.
 *
 * `overrides` carry the composer's effective provider/model so the wire
 * mirrors the dropdown; the source decides whether to honor or re-resolve
 * them inside `sendMessageNow`.
 */
export function useBoardSendQueue({
  selectedSessionKey,
  selectedAgentPath,
  selectedSessionActive,
  overrides,
  sendMessageNow,
  panelComposerSubmit,
}: {
  selectedSessionKey: string | null;
  selectedAgentPath: string | null;
  selectedSessionActive: boolean;
  overrides: SendOverrides;
  sendMessageNow: (
    sessionKey: string,
    text: string,
    files: File[],
    overrides: SendOverrides,
  ) => Promise<void>;
  panelComposerSubmit: AIBoardProps["onComposerSubmit"];
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
    isActive: selectedSessionActive,
    sendNow: sendSelectedNow,
  });

  const handleSendMessage = useCallback(
    async (sessionKey: string, text: string, files: File[]) => {
      if (sessionKey === selectedSessionKey) {
        await messageQueue.sendOrQueue(text, files);
        return;
      }
      await sendMessageNow(sessionKey, text, files, overrides);
    },
    [selectedSessionKey, messageQueue.sendOrQueue, sendMessageNow, overrides],
  );

  const handleComposerSubmit = useCallback<ComposerSubmit>(
    async (ctx) => {
      if (
        ctx.sessionKey &&
        ctx.sessionKey === selectedSessionKey &&
        selectedSessionActive
      ) {
        messageQueue.queueMessage(ctx.text, ctx.files);
        return true;
      }
      return (await panelComposerSubmit?.(ctx)) ?? false;
    },
    [
      selectedSessionKey,
      selectedSessionActive,
      messageQueue.queueMessage,
      panelComposerSubmit,
    ],
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
    handleComposerSubmit,
    queuedMessages,
    onRemoveQueuedMessage,
  };
}
