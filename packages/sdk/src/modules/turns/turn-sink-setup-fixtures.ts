import {
  type ChatMessage,
  EngineError,
  type WireFrame,
} from "@houston/runtime-client";
import type { FeedOutput } from "./feed-output";
import { TurnSink } from "./turn-sink";

export type Item = {
  feed_type?: string;
  data?: unknown;
  notice?: string;
  cause?: string;
  fails_pending?: boolean;
};

export const POLL_MS = 1_500;

export function makeSink(reloadHistory: () => Promise<ChatMessage[]>) {
  const items: Item[] = [];
  const statuses: string[] = [];
  let stops = 0;
  const output: FeedOutput = {
    pushFeedItem: (_a, _s, item) => {
      items.push(item as Item);
    },
    sessionStatus: (_a, _s, status) => {
      statuses.push(status);
    },
    persistBoardStatus: async () => {},
  };
  const sink = new TurnSink({
    agentPath: "Houston/Bo",
    sessionKey: "activity-new",
    output,
    mode: "turn",
    nonce: "our-nonce",
    prompt: "hi",
    stop: () => {
      stops++;
    },
    reloadHistory,
    historyGuard: () => false,
    presettledPollMs: POLL_MS,
  });
  return { sink, items, statuses, stopped: () => stops > 0 };
}

export const idleSync: WireFrame = {
  type: "sync",
  data: { running: false, partial: "", seq: 1 },
  seq: 1,
};

export const setupError = (
  turnId: string,
  code = "hydrate_over_cap",
): WireFrame =>
  ({
    type: "error",
    data: { message: "Your agent could not start.", code, detail: "detail" },
    turnId,
    seq: 2,
  }) as WireFrame;

export const notFound = (): Promise<ChatMessage[]> =>
  Promise.reject(
    new EngineError(404, JSON.stringify({ error: "conversation not found" })),
  );

export const systemLines = (items: Item[]) =>
  items.filter((i) => i.feed_type === "system_message");
