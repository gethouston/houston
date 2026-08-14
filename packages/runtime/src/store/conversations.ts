import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type {
  ConversationHistory,
  ConversationSummary,
} from "@houston/runtime-client";
import { config } from "../config";
import {
  type AssistantMessageMeta,
  appendAssistantMessageAt,
  appendUserMessageAt,
  deleteConversationAt,
  getHistoryAt,
  type HistoryWindow,
  listConversationsAt,
  loadConversation,
  renameConversationMutationAt,
  type UserMessageMeta,
} from "./conversation-file";
import {
  consumeSessionReplayAt,
  truncateConversationMutationAt,
} from "./conversation-truncate";
import { snapshotMessage, type TranscriptShadow } from "./transcript-shadow";
import { SandboxTranscriptShadowTransport } from "./transcript-shadow-http";
import { TranscriptShadowQueue } from "./transcript-shadow-queue";

export function createConversationStore(
  dir: string,
  shadow?: TranscriptShadow,
) {
  mkdirSync(dir, { recursive: true });
  const notify = (
    operation: () => Parameters<TranscriptShadow["enqueue"]>[0],
  ) => {
    try {
      if (shadow) shadow.enqueue(operation());
    } catch (error) {
      console.debug("[transcript-shadow] enqueue failed", error);
    }
  };

  return {
    appendUserMessage(id: string, content: string, meta?: UserMessageMeta) {
      const result = appendUserMessageAt(dir, id, content, meta);
      notify(() => {
        // Message-only: the wire needs just the delta. The full-conversation
        // snapshot (an O(n) clone on the hot path) is gone — the queue reads
        // the file itself on the rare repair path.
        const turnId = result.message.turnId;
        return turnId
          ? {
              kind: "user",
              conversationId: id,
              turnId,
              message: snapshotMessage(result.message),
              title: result.conversation.title,
              expectedCount: result.expectedCount,
              needsSessionReplay: result.needsSessionReplay,
            }
          : { kind: "repair", conversationId: id };
      });
    },
    appendAssistantMessage(
      id: string,
      content: string,
      meta?: AssistantMessageMeta,
    ) {
      const result = appendAssistantMessageAt(dir, id, content, meta);
      if (!result) return;
      notify(() => {
        const turnId = result.message.turnId;
        return turnId
          ? {
              kind: "assistant",
              conversationId: id,
              turnId,
              message: snapshotMessage(result.message),
            }
          : { kind: "repair", conversationId: id };
      });
    },
    getHistory: (id: string, window?: HistoryWindow) =>
      getHistoryAt(dir, id, window),
    listConversations: () => listConversationsAt(dir),
    renameConversation(id: string, title: string): boolean {
      const result = renameConversationMutationAt(dir, id, title);
      if (!result) return false;
      notify(() => ({
        kind: "rename",
        conversationId: id,
        title: result.title,
      }));
      return true;
    },
    deleteConversation(id: string): boolean {
      const deleted = deleteConversationAt(dir, id);
      if (deleted) notify(() => ({ kind: "delete", conversationId: id }));
      return deleted;
    },
    truncateConversation(id: string, turnId: string) {
      const result = truncateConversationMutationAt(dir, id, turnId);
      if (!result) return null;
      notify(() => ({ kind: "truncate", conversationId: id, turnId }));
      return { removed: result.removed };
    },
    consumeSessionReplay: (id: string) => consumeSessionReplayAt(dir, id),
  };
}

const dir = join(config.dataDir, "conversations");
const shadow =
  config.transcriptDualWrite && config.controlPlaneUrl && config.sandboxToken
    ? new TranscriptShadowQueue(
        new SandboxTranscriptShadowTransport(
          config.controlPlaneUrl,
          config.sandboxToken,
        ),
        (conversationId) => loadConversation(dir, conversationId),
      )
    : undefined;
const store = createConversationStore(dir, shadow);

/**
 * Bounded, best-effort drain of the transcript shadow queue for process
 * shutdown: the queue's pending sends and dirty markers are in-memory only, so
 * a scale-to-zero right after a file mutation would otherwise strand the
 * remote shadow stale until the next mutation. No-op when the dual-write flag
 * is off; never rejects; never holds shutdown past `timeoutMs`.
 */
export async function drainTranscriptShadowForShutdown(
  timeoutMs: number,
): Promise<void> {
  await shadow?.drainForShutdown(timeoutMs);
}

export function appendUserMessage(
  id: string,
  content: string,
  meta?: UserMessageMeta,
) {
  store.appendUserMessage(id, content, meta);
}

export function appendAssistantMessage(
  id: string,
  content: string,
  meta?: AssistantMessageMeta,
) {
  store.appendAssistantMessage(id, content, meta);
}

export function markConversationStopped(id: string): void {
  appendAssistantMessage(id, "", { stopped: true });
}

export function getHistory(
  id: string,
  window?: HistoryWindow,
): ConversationHistory | null {
  return store.getHistory(id, window);
}

export function listConversations(): ConversationSummary[] {
  return store.listConversations();
}

export const renameConversation = store.renameConversation;
export const deleteConversation = store.deleteConversation;
export const truncateConversation = store.truncateConversation;
export const consumeSessionReplay = store.consumeSessionReplay;
