import type { ChatStatus } from "./chat-panel-types";
import type {
  ChatMessage,
  FileChangeEntry,
  ToolEntry,
} from "./feed-to-messages";

export interface TurnEndSummary {
  tools: ToolEntry[];
  fileChanges: FileChangeEntry[];
}

export function computeTurnEndSummary(
  messages: ChatMessage[],
  status: ChatStatus,
): Map<number, TurnEndSummary> {
  const summaries = new Map<number, TurnEndSummary>();
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.from !== "assistant") continue;
    const next = messages[i + 1];
    const isEndOfTurn = next ? next.from !== "assistant" : status === "ready";
    if (!isEndOfTurn) continue;
    const tools: ToolEntry[] = [];
    const fileChanges: FileChangeEntry[] = [];
    for (let j = i; j >= 0; j--) {
      const m = messages[j];
      if (m.from !== "assistant") break;
      tools.unshift(...m.tools);
      fileChanges.unshift(...m.fileChanges);
    }
    summaries.set(i, { tools, fileChanges });
  }
  return summaries;
}
