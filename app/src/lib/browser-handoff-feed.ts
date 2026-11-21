import {
  type BrowserHandoffCardModel,
  browserHandoffFeedRows,
} from "@houston/sdk/browser-handoff";
import type { FeedItem, HostCard } from "@houston-ai/chat";

const BROWSER_HANDOFF_CARD = "browser_handoff";

export interface BrowserHandoffCardPayload extends BrowserHandoffCardModel {
  conversationId: string;
}

export function browserHandoffCard(
  card: HostCard,
): BrowserHandoffCardPayload | null {
  return card.kind === BROWSER_HANDOFF_CARD
    ? (card.payload as BrowserHandoffCardPayload)
    : null;
}

export function withBrowserHandoffCards(
  items: readonly FeedItem[],
  turnRunning: boolean,
  conversationId: string,
): FeedItem[] {
  const rows = browserHandoffFeedRows(items, turnRunning);
  if (!rows.some((row) => row.kind === "card")) return [...items];
  return rows.map((row): FeedItem => {
    if (row.kind === "item") {
      const item = items[row.index];
      return row.settled && item.feed_type === "assistant_text_streaming"
        ? { ...item, feed_type: "assistant_text" }
        : item;
    }
    const { card } = row;
    const payload: BrowserHandoffCardPayload = { ...card, conversationId };
    return {
      feed_type: "host_card",
      id: card.key,
      data: {
        kind: BROWSER_HANDOFF_CARD,
        payload,
        ...(card.state === "waiting" ? { ownsProgress: true } : {}),
      },
    };
  });
}
