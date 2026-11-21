import type { Specimen } from "../../../src/specimen";
import { specimen as chatAttachmentMessage } from "./chat-attachment-message";
import { specimen as chatConversation } from "./chat-conversation";
import { specimen as chatInput } from "./chat-input";
import { specimen as chatMessage } from "./chat-message";
import { specimen as chatPlanReadyCard } from "./chat-plan-ready-card";
import { specimen as chatQueuedMessages } from "./chat-queued-messages";
import { specimen as chatStatusLine } from "./chat-status-line";
import { specimen as chatSuggestReusableCard } from "./chat-suggest-reusable-card";
import { specimen as chatThinkingIndicator } from "./chat-thinking-indicator";
import { specimen as chatToolBlock } from "./chat-tool-block";

export const specimens: readonly Specimen[] = [
  chatMessage,
  chatConversation,
  chatToolBlock,
  chatAttachmentMessage,
  chatInput,
  chatQueuedMessages,
  chatStatusLine,
  chatThinkingIndicator,
  chatPlanReadyCard,
  chatSuggestReusableCard,
];
