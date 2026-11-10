import type {
  EventStreamOptions,
  HoustonEngineClient,
} from "@houston/runtime-client";
import { afterEach, expect, test } from "vitest";
import type { FeedOutput } from "./feed-output";
import { StreamRegistry } from "./stream-registry";
import { streamTurn } from "./turn-stream";

/**
 * `onAccepted` tells the sender the engine took the message (file comments
 * leave their draft for good on it). A fast turn can echo, reply and finish
 * before its POST answers: settling the stream aborts that POST, yet the
 * engine ran the turn.
 */

const registry = new StreamRegistry();
afterEach(() => registry.disposeAll());

const output: FeedOutput = {
  pushFeedItem: () => {},
  sessionStatus: () => {},
  persistBoardStatus: async () => {},
};

async function waitFor(cond: () => boolean): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > 2_000) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
}

test("a turn that finishes before its POST answers still counts as accepted", async () => {
  let nonce: string | undefined;
  let postAborted = false;
  const engine = {
    async streamEvents(_id: string, o: EventStreamOptions) {
      o.onEvent({
        type: "sync",
        data: { running: false, partial: "", seq: 0 },
      });
      await waitFor(() => nonce !== undefined);
      o.onEvent({
        type: "user",
        data: { content: "hi", ts: 1, nonce },
        turnId: "t-mine",
        seq: 1,
      });
      o.onEvent({ type: "text", data: "Done", turnId: "t-mine", seq: 2 });
      o.onEvent({ type: "done", data: null, turnId: "t-mine", seq: 3 });
    },
    // The 202 never comes before the turn settles: the settle aborts it.
    sendMessage(
      _id: string,
      _text: string,
      opts: { nonce?: string; signal?: AbortSignal },
    ) {
      nonce = opts.nonce;
      return new Promise((_resolve, reject) => {
        opts.signal?.addEventListener(
          "abort",
          () => {
            postAborted = true;
            const e = new Error("signal is aborted without reason");
            e.name = "AbortError";
            reject(e);
          },
          { once: true },
        );
      });
    },
    async getHistory() {
      return { id: "c", title: "", messages: [] };
    },
  } as unknown as HoustonEngineClient;

  let accepted = 0;
  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-fast",
    "hi",
    output,
    registry,
    {
      tuning: {
        idleTimeoutMs: 2_000,
        backoff: { initialMs: 1, maxMs: 2, jitter: () => 0 },
      },
      onAccepted: () => accepted++,
    },
  );

  expect(postAborted).toBe(true);
  expect(accepted).toBe(1);
});
