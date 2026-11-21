import type { Agent } from "../../lib/types";
import { useAgentBoardSend } from "../board/use-agent-board-send";
import { useBoardSendQueue } from "../board/use-board-send-queue";
import { useComposerSendOverrides } from "../board/use-composer-send-overrides";
import type { useAgentChatPanel } from "../use-agent-chat-panel";
import { useManagerHandoff } from "./use-manager-handoff";

type ComposerPin = Pick<
  ReturnType<typeof useAgentChatPanel>,
  | "effectiveProvider"
  | "effectiveModel"
  | "effectiveEffort"
  | "turnMode"
  | "resolveSendPin"
>;

export function useAssistantSend(
  agent: Agent,
  sessionKey: string,
  pin: ComposerPin,
) {
  const overrides = useComposerSendOverrides(pin);
  const send = useAgentBoardSend({
    agent,
    rawItems: undefined,
    openSessionKey: sessionKey,
  });
  const sendQueue = useBoardSendQueue({
    selectedSessionKey: sessionKey,
    selectedAgentPath: agent.folderPath,
    overrides,
    resolveSendPin: pin.resolveSendPin,
    sendMessageNow: send.sendMessageNow,
  });
  useManagerHandoff(
    sessionKey,
    sendQueue.sendAuthored,
    send.effectiveLoading[sessionKey] === true,
  );
  return { send, sendQueue };
}
