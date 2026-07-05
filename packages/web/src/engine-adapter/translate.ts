import { type ChatMessage, EngineError } from "@houston/runtime-client";
import { historyToFeed as foldHistoryToFeed } from "@houston/sdk";
import type { ChatHistoryEntry } from "../../../../ui/engine-client/src/types";
import { toOldProvider } from "./synthetic";

// The turn error/stop/not-connected classifiers moved into `@houston/sdk` with
// the turn machinery; re-exported here so the adapter's unit tests (and any
// legacy import) keep resolving them from this path.
export {
  isNotConnectedError,
  isStoppedByUser,
  turnErrorMessage,
} from "@houston/sdk";

/**
 * Convert new-engine history (ChatMessage[]) into old FeedItem[] for replay.
 *
 * ONE fold, shared with the SDK (`@houston/sdk` `historyToFeed`) — the adapter
 * just injects its own provider-id remap (`toOldProvider`), so the desktop's
 * persisted provider-switch dividers and provider-error cards resolve the
 * frontend provider NAME while the SDK carries the pi id through unchanged.
 */
export function historyToFeed(messages: ChatMessage[]): ChatHistoryEntry[] {
  return foldHistoryToFeed(messages, toOldProvider) as ChatHistoryEntry[];
}

/**
 * Whether a history load failed because the conversation simply doesn't exist
 * on the runtime yet. A conversation persists on its FIRST turn, so a fresh
 * card opened before that turn lands 404s on `GET /conversations/:id/messages`
 * — that IS an empty conversation, not a failure. Everything else (network
 * drop, auth, 5xx) is a real error and must surface, never render as empty.
 */
export function isConversationNotFound(err: unknown): boolean {
  return err instanceof EngineError && err.status === 404;
}
