import type { ChatMessage } from "@houston/runtime-client";
import type { StoredConversation } from "./conversation-file";

interface ShadowBase {
  conversationId: string;
}

/**
 * What a file mutation enqueues: only the delta the wire needs (one message
 * plus scalars), never the whole conversation. A `repair` carries NO payload —
 * the queue snapshots the authoritative file at send time — so the hot append
 * path never pays an O(conversation) clone; that cost is reserved for the rare
 * repair send.
 */
export type TranscriptShadowOperation =
  | (ShadowBase & {
      kind: "user";
      turnId: string;
      message: ChatMessage;
      title: string;
      expectedCount: number;
    })
  | (ShadowBase & {
      kind: "assistant";
      turnId: string;
      message: ChatMessage;
    })
  | (ShadowBase & { kind: "truncate"; turnId: string })
  | (ShadowBase & { kind: "rename"; title: string })
  | (ShadowBase & { kind: "delete" })
  | (ShadowBase & { kind: "repair" });

/** The enqueue shapes that queue as-is (everything but the payload-less repair). */
export type QueuedShadowOperation = Exclude<
  TranscriptShadowOperation,
  { kind: "repair" }
>;

/**
 * What the transport actually sends: identical to the enqueue shape except
 * `repair`, whose whole-conversation body the queue resolves from the file at
 * send time. The wire bytes are unchanged — the host route still validates the
 * exact same request shapes.
 */
export type TranscriptShadowSend =
  | QueuedShadowOperation
  | (ShadowBase & { kind: "repair"; conversation: StoredConversation });

export interface TranscriptShadow {
  enqueue(operation: TranscriptShadowOperation): void;
}

export interface TranscriptShadowTransport {
  send(operation: TranscriptShadowSend): Promise<void>;
}

/** Freeze the mutable parse-cache object at the file/shadow seam. */
export function snapshotConversation(
  conversation: StoredConversation,
): StoredConversation {
  return JSON.parse(JSON.stringify(conversation)) as StoredConversation;
}

/**
 * Freeze ONE message at the file/shadow seam — O(message), not
 * O(conversation). Appenders keep mutating the cached conversation object
 * while the queue drains; the enqueued op must not see that.
 */
export function snapshotMessage(message: ChatMessage): ChatMessage {
  return JSON.parse(JSON.stringify(message)) as ChatMessage;
}
