import type { ChatMessage } from "@houston/runtime-client";
import type { StoredConversation } from "./conversation-file";

interface ShadowBase {
  conversationId: string;
}

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

export type QueuedShadowOperation = Exclude<
  TranscriptShadowOperation,
  { kind: "repair" }
>;

export type TranscriptShadowSend =
  | QueuedShadowOperation
  | (ShadowBase & { kind: "repair"; conversation: StoredConversation });

export interface TranscriptShadow {
  enqueue(operation: TranscriptShadowOperation): void;
}

export interface TranscriptShadowTransport {
  send(operation: TranscriptShadowSend): Promise<void>;
}

export function snapshotConversation(
  conversation: StoredConversation,
): StoredConversation {
  return JSON.parse(JSON.stringify(conversation)) as StoredConversation;
}

export function snapshotMessage(message: ChatMessage): ChatMessage {
  return JSON.parse(JSON.stringify(message)) as ChatMessage;
}
