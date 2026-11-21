import type { ChatMessage } from "@houston/runtime-client";

export function turnRow(
  after: ChatMessage[],
  turnId: string,
): ChatMessage | undefined {
  const own = after.filter(
    (message) => message.role === "assistant" && message.turnId === turnId,
  );
  const last = own.at(-1);
  if (!last || last.compaction) return last;
  const boundary = own.findLast((message) => message.compaction)?.compaction;
  return boundary ? { ...last, compaction: boundary } : last;
}
