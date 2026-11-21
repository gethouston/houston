import type { BrowserHandoffFeedItem } from "./handoff-calls";
import {
  type BrowserHandoffCardModel,
  browserHandoffCards,
} from "./handoff-card";

export * from "./handoff-card";

export type BrowserHandoffFeedRow =
  | {
      kind: "item";
      index: number;
      settled?: true;
    }
  | { kind: "card"; card: BrowserHandoffCardModel };

const REPLY = new Set(["assistant_text", "assistant_text_streaming"]);
const TOOL_ROW = new Set(["tool_call", "tool_result"]);
const TURN_EDGE = new Set(["user_message", "final_result", "system_message"]);

function sameTurn(
  a: BrowserHandoffFeedItem,
  b: BrowserHandoffFeedItem,
): boolean {
  return a.turnId === b.turnId;
}

function replyBefore(
  items: readonly BrowserHandoffFeedItem[],
  anchor: number,
): number | null {
  for (let i = anchor - 1; i >= 0; i--) {
    const item = items[i];
    if (TURN_EDGE.has(item.feed_type)) return null;
    if (item.turnId !== undefined && !sameTurn(item, items[anchor]))
      return null;
    if (REPLY.has(item.feed_type) && sameTurn(item, items[anchor])) return i;
  }
  return null;
}

function lastToolRow(
  items: readonly BrowserHandoffFeedItem[],
  anchor: number,
): number {
  let last = anchor;
  for (let i = anchor + 1; i < items.length; i++) {
    const item = items[i];
    if (TURN_EDGE.has(item.feed_type) || !sameTurn(item, items[anchor])) break;
    if (TOOL_ROW.has(item.feed_type)) last = i;
  }
  return last;
}

export function browserHandoffFeedRows(
  items: readonly BrowserHandoffFeedItem[],
  turnRunning: boolean,
): BrowserHandoffFeedRow[] {
  const cards = browserHandoffCards(items, turnRunning);
  const cardsAfter = new Map<number, BrowserHandoffCardModel[]>();
  const moved = new Map<number, number>();
  for (const card of cards) {
    const list = cardsAfter.get(card.anchorIndex) ?? [];
    list.push(card);
    cardsAfter.set(card.anchorIndex, list);
    const reply = replyBefore(items, card.anchorIndex);
    if (reply === null) continue;
    const after = lastToolRow(items, card.anchorIndex);
    moved.set(reply, Math.max(moved.get(reply) ?? after, after));
  }
  const rows: BrowserHandoffFeedRow[] = [];
  items.forEach((_, index) => {
    if (!moved.has(index)) rows.push({ kind: "item", index });
    for (const card of cardsAfter.get(index) ?? [])
      rows.push({ kind: "card", card });
    for (const [reply, after] of moved)
      if (after === index)
        rows.push({ kind: "item", index: reply, settled: true });
  });
  return rows;
}
