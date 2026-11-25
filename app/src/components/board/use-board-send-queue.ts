import type { AIBoardProps } from "@houston-ai/board";
import type { MessageMention } from "@houston-ai/chat";
import { useCallback, useMemo } from "react";
import { useSessionMessageQueue } from "../../hooks/use-session-message-queue";
import { isAgentPathWarming } from "../../lib/agent-warming-guard";
import type { ModelPin } from "../../lib/model-selector-lock";
import type { SendOverrides } from "./board-source";
import { settleOnPin } from "./composer-send-overrides";

/**
 * Follow-up send + queue display shared by both board views.
 *
 * Queue-while-running lives in the engine adapter now (a send into a running
 * conversation is held and flushed as one combined send at settle), so every
 * send here just sends; this hook renders the open conversation's queued
 * bubbles and forwards the remove affordance.
 *
 * `overrides` carry the composer's effective provider/model/effort so the wire
 * mirrors the dropdown; the source decides whether to honor or re-resolve
 * them inside `sendMessageNow`. `resolveSendPin` (the chat panel's gate,
 * PRODUCT-1771) supersedes the captured pin at SEND time: a send
 * fired while the composer is still resolving waits for the settled pin
 * instead of shipping the guess it was rendered with.
 */
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
    // A warming / asleep pod holds every read for the whole wake: the send is
    // parked instead (HOU-693 / HOU-730) and the flush re-reads the row's own
    // pin (PRODUCT-1643), so waiting here would only freeze the composer.
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

  // The composer's per-send @mentions (HOU-944) merge into the same overrides
  // bag as the provider/model pick, so every `sendMessageNow` gets them from
  // one argument. `undefined` (the message named nobody) is dropped rather than
  // sent as an empty list.
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

  // A message Houston writes for the person (their `text` as the bubble, over
  // a hidden `context` the model reads), on the same settled pin as a typed
  // send, carrying any approval the person already gave for it.
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

  const messageQueueRemoveQueuedMessage = messageQueue.removeQueuedMessage;
  const onRemoveQueuedMessage = useCallback(
    (_sessionKey: string, id: string) => messageQueueRemoveQueuedMessage(id),
    [messageQueueRemoveQueuedMessage],
  );

  return {
    handleSendMessage,
    sendAuthored,
    queuedMessages,
    onRemoveQueuedMessage,
  };
}
