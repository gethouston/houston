import type { AIBoardProps } from "@houston-ai/board";
import type { MessageMention } from "@houston-ai/chat";
import { useCallback, useMemo } from "react";
import { useSessionMessageQueue } from "../../hooks/use-session-message-queue";
import { isAgentPathWarming } from "../../lib/agent-warming-guard";
import type { ModelPin } from "../../lib/model-selector-lock";
import type { SendOverrides } from "./board-source";
import { settleOnPin } from "./composer-send-overrides";

export function useBoardSendQueue({
  selectedSessionKey,
  selectedAgentPath,
  overrides,
  resolveSendPin,
  sendMessageNow,
}: {
  selectedSessionKey: string | null;
  selectedAgentPath: string | null;
  overrides: SendOverrides;
  resolveSendPin?: () => Promise<ModelPin>;
  sendMessageNow: (
    sessionKey: string,
    text: string,
    files: File[],
    overrides: SendOverrides,
    context?: string,
  ) => Promise<void>;
}) {
  const settledOverrides = useCallback(async (): Promise<SendOverrides> => {
    if (
      !resolveSendPin ||
      (selectedAgentPath && isAgentPathWarming(selectedAgentPath))
    )
      return overrides;
    return settleOnPin(overrides, await resolveSendPin());
  }, [overrides, resolveSendPin, selectedAgentPath]);

  const sendSelectedNow = useCallback(
    async (text: string, files: File[]) => {
      if (!selectedSessionKey) return;
      await sendMessageNow(
        selectedSessionKey,
        text,
        files,
        await settledOverrides(),
      );
    },
    [selectedSessionKey, sendMessageNow, settledOverrides],
  );

  const messageQueue = useSessionMessageQueue({
    agentPath: selectedAgentPath,
    sessionKey: selectedSessionKey,
    sendNow: sendSelectedNow,
  });

  const handleSendMessage = useCallback(
    async (
      sessionKey: string,
      text: string,
      files: File[],
      mentions?: MessageMention[],
    ) => {
      await sendMessageNow(sessionKey, text, files, {
        ...(await settledOverrides()),
        mentions,
      });
    },
    [sendMessageNow, settledOverrides],
  );

  const sendAuthored = useCallback(
    async (
      sessionKey: string,
      text: string,
      context: string,
      grants?: SendOverrides["grants"],
    ) => {
      await sendMessageNow(
        sessionKey,
        text,
        [],
        { ...(await settledOverrides()), grants, sentForPerson: true },
        context,
      );
    },
    [sendMessageNow, settledOverrides],
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
    sendAuthored,
    queuedMessages,
    onRemoveQueuedMessage,
  };
}
