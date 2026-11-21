import { type ChatMessage, EngineError } from "@houston/runtime-client";
import { historyToFeed as foldHistoryToFeed } from "@houston/sdk";
import type { ChatHistoryEntry } from "@houston/wire-types";
import { toOldProvider } from "./synthetic";

export {
  isNotConnectedError,
  isStoppedByUser,
  turnErrorMessage,
} from "@houston/sdk";

export function historyToFeed(messages: ChatMessage[]): ChatHistoryEntry[] {
  return foldHistoryToFeed(messages, toOldProvider) as ChatHistoryEntry[];
}

export function isConversationNotFound(err: unknown): boolean {
  return err instanceof EngineError && err.status === 404;
}
