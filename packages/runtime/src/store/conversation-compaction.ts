import { join } from "node:path";
import { config } from "../config";
import {
  type CompactionCheckpoint,
  loadConversation,
  saveConversation,
} from "./conversation-file";

export type { CompactionCheckpoint } from "./conversation-file";

export interface CompactionCheckpoints {
  read(id: string): CompactionCheckpoint | undefined;
  save(id: string, summary: string): CompactionCheckpoint;
  consume(id: string, checkpoint: CompactionCheckpoint): void;
}

/** The summary and its transcript marker land in the same atomic file write. */
export function createCompactionCheckpoints(
  dir: string,
): CompactionCheckpoints {
  return {
    read: (id) => loadConversation(dir, id)?.claudeCompaction,
    save(id, summary) {
      const conv = loadConversation(dir, id);
      if (!conv) throw new Error(`Cannot compact missing conversation ${id}`);
      const checkpoint = { summary, createdAt: Date.now() };
      saveConversation(dir, {
        ...conv,
        claudeCompaction: checkpoint,
        updatedAt: checkpoint.createdAt,
        messages: [
          ...conv.messages,
          {
            role: "assistant",
            content: summary,
            ts: checkpoint.createdAt,
            compaction: { trigger: "native" },
          },
        ],
      });
      return checkpoint;
    },
    consume(id, checkpoint) {
      const conv = loadConversation(dir, id);
      if (
        conv?.claudeCompaction?.createdAt !== checkpoint.createdAt ||
        conv.claudeCompaction.summary !== checkpoint.summary
      )
        return;
      const { claudeCompaction: _consumed, ...next } = conv;
      saveConversation(dir, next);
    },
  };
}

export const conversationCompactions = createCompactionCheckpoints(
  join(config.dataDir, "conversations"),
);
