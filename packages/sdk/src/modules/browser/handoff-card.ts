import { browserHandoffFailureOf } from "@houston/wire-types";
import {
  type BrowserHandoffFeedItem,
  type FeedCall,
  feedCalls,
  fields,
} from "./handoff-calls";

export type { BrowserHandoffFeedItem } from "./handoff-calls";

export type BrowserHandoffCardState =
  | "waiting"
  | "done"
  | "cancelled"
  | "expired"
  | "ended";

export interface BrowserHandoffCardModel {
  key: string;
  anchorIndex: number;
  text: string;
  url: string | null;
  site: string | null;
  state: BrowserHandoffCardState;
}

export function isBrowserToolName(name: string): boolean {
  return name === "browser" || name.endsWith("__browser");
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

function stateOf(
  items: readonly BrowserHandoffFeedItem[],
  call: FeedCall,
  waiting: boolean,
): BrowserHandoffCardState {
  if (call.result === null) return waiting ? "waiting" : "ended";
  const result = fields(items[call.result]?.data);
  const content = String(result?.content ?? "");
  if (result?.is_error !== true) return content.trim() ? "done" : "ended";
  const failure = browserHandoffFailureOf(content);
  if (failure === "handoff_cancelled") return "cancelled";
  if (failure === "handoff_expired") return "expired";
  return "ended";
}

function turnSite(
  calls: readonly FeedCall[],
  before: number,
  turnStart: number,
): string | null {
  for (let i = before - 1; i >= 0 && calls[i].index > turnStart; i--) {
    const input = calls[i].input;
    if (!isBrowserToolName(calls[i].name) || !input) continue;
    if (input.action !== "open" && input.action !== "handoff") continue;
    const site = hostOf(str(input.url));
    if (site) return site;
  }
  return null;
}

function movedOn(
  calls: readonly FeedCall[],
  position: number,
  turnEnds: readonly number[],
): boolean {
  const call = calls[position];
  if (turnEnds.some((end) => end > call.index)) return true;
  return calls
    .slice(position + 1)
    .some(
      (later) =>
        later.result !== null ||
        (later.turnId !== undefined &&
          call.turnId !== undefined &&
          later.turnId !== call.turnId),
    );
}

export function browserHandoffCards(
  items: readonly BrowserHandoffFeedItem[],
  turnRunning: boolean,
): BrowserHandoffCardModel[] {
  const { calls, turnEnds } = feedCalls(items);
  const cards: BrowserHandoffCardModel[] = [];
  calls.forEach((call, position) => {
    if (!isBrowserToolName(call.name) || call.input?.action !== "handoff")
      return;
    const url = str(call.input.url);
    cards.push({
      key: `${items[call.index].id ?? call.index}:handoff`,
      anchorIndex: call.result ?? call.index,
      text: str(call.input.text) ?? "",
      url,
      site:
        hostOf(url) ??
        turnSite(
          calls,
          position,
          Math.max(-1, ...turnEnds.filter((end) => end < call.index)),
        ),
      state: stateOf(
        items,
        call,
        turnRunning && !movedOn(calls, position, turnEnds),
      ),
    });
  });
  return cards;
}
