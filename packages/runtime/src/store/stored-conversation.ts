import type { ChatMessage } from "@houston/runtime-client";
import type { ArchiveIndex } from "./conversation-archive";

export type StoredConversation = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  needsSessionReplay?: true;
  claudeCompaction?: CompactionCheckpoint;
  archived?: ArchiveIndex;
};

export interface CompactionCheckpoint {
  summary: string;
  createdAt: number;
}
