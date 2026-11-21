import { isAutoContinue } from "@houston/protocol";
import type { ChatMessage } from "@houston/runtime-client";
import { assistantHistory } from "./history-assistant";
import type { EngineNoticeKind } from "./turn-errors";
import type { FeedAuthor, FeedMention } from "./vm-output";

export interface FeedFrame {
  feed_type: string;
  data: unknown;
  author?: FeedAuthor;
  mentions?: FeedMention[];
  notice?: EngineNoticeKind;
  ts?: number;
  turnId?: string;
  toolIndex?: number;
}

const identityProvider = (id: string): string => id;

export function historyToFeed(
  messages: ChatMessage[],
  mapProvider: (id: string) => string = identityProvider,
): FeedFrame[] {
  const out: FeedFrame[] = [];
  for (const [i, m] of messages.entries()) {
    const ts = m.ts;
    const turn = m.turnId !== undefined ? { turnId: m.turnId } : {};
    if (m.role === "user") {
      if (isAutoContinue(m.content)) continue;
      out.push({
        feed_type: "user_message",
        data: m.displayText ?? m.content,
        author: m.author,
        mentions: m.mentions,
        ts,
        ...turn,
      });
      continue;
    }
    out.push(...assistantHistory(m, mapProvider, messages[i + 1]));
  }
  return out;
}
