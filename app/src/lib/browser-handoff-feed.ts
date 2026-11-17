import type { FeedItem, HostCard } from "@houston-ai/chat";
import {
  type BrowserHandoffCardModel,
  browserHandoffFeedRows,
} from "@houston/sdk/browser-handoff";

const BROWSER_HANDOFF_CARD = "browser_handoff";

/** What a hand-off card row carries: the SDK's model plus the chat it is in,
 *  because a system row reaches its renderer without its conversation. */
export interface BrowserHandoffCardPayload extends BrowserHandoffCardModel {
  conversationId: string;
}

/** The hand-off a host card row carries, or null for any other row. Only
 *  {@link withBrowserHandoffCards} builds these rows, so the payload is its own. */
export function browserHandoffCard(
  card: HostCard,
): BrowserHandoffCardPayload | null {
  return card.kind === BROWSER_HANDOFF_CARD
    ? (card.payload as BrowserHandoffCardPayload)
    : null;
}

/**
 * The chat's feed with a card after every browser hand-off, laid out by the
 * SDK (`browserHandoffFeedRows`): after the tool's result once it has one,
 * else right after the call, and in the same place before and after the turn
 * ends. A reply of the card's turn sits under the card, which the SDK marks
 * `settled`: drawn as finished text, so the chat never reads it as its
 * streaming tail. While the hand-off waits the card owns the turn's progress;
 * once the person hands back, the usual thinking line shows while the agent
 * works on.
 */
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
