import type { ChatMessage } from "@houston/runtime-client";

export function turnReply(
  messages: readonly ChatMessage[],
  turnId: string,
): ChatMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (
      m?.role === "assistant" &&
      m.turnId === turnId &&
      m.compaction?.trigger !== "native"
    )
      return m;
  }
  return undefined;
}

export function conclusiveReply(
  messages: readonly ChatMessage[],
  turnId: string | undefined,
  guard: (messages: ChatMessage[]) => boolean,
): ChatMessage | null {
  if (turnId) return turnReply(messages, turnId) ?? null;
  const all = [...messages];
  if (!guard(all)) return null;
  let at = all.length - 1;
  while (at >= 0 && all[at]?.role !== "user") at--;
  const own = all[at]?.turnId;
  if (own) return turnReply(all.slice(at + 1), own) ?? null;
  const last = all[all.length - 1];
  return last?.role === "assistant" && last.compaction?.trigger !== "native"
    ? last
    : null;
}
