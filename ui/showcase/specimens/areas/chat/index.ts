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

/**
 * The **Chat** area: the mission conversation — the stream a turn lands in,
 * the composer it is written in, the lines that mark waiting, and the cards
 * that take the composer's place when the agent needs a decision.
 *
 * One file per component in this folder (`<component>.tsx`, each exporting
 * `export const specimen: Specimen` with `group: "Chat"` alongside
 * `export const sources: string[]`), imported here and listed below in the
 * order a mission reads: the stream, then the composer, then the waiting
 * states, then the composer-replacing cards.
 *
 * `ChatPanel` — the whole screen, assembled — has no page of its own on
 * purpose: it takes a live feed, a session key and a sender resolver, and a
 * static fixture of it would document a mock rather than the product.
 */
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
