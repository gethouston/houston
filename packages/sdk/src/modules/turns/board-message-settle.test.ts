import { applyActivityUpdate } from "@houston/domain";
import type {
  EventStreamOptions,
  HoustonEngineClient,
  WireFrame,
} from "@houston/runtime-client";
import { afterEach, expect, test, vi } from "vitest";
import { TurnBoardWrites } from "./board-writes";
import type { FeedOutput } from "./feed-output";
import { observeConversation } from "./observe-stream";
import { StreamRegistry } from "./stream-registry";
import { STOPPED_BY_USER, TURN_DIED_MESSAGE } from "./turn-errors";
import {
  finishErr,
  finishOk,
  newTurnState,
  settleProviderErrorCard,
} from "./turn-settle";

const earlier = "2026-10-26T10:00:00.000Z";
afterEach(() => vi.useRealTimers());

for (const outcome of [
  "stop",
  "died",
  "provider",
  "error",
  "success",
] as const) {
  test(`${outcome} settles the card, stamping only a successful reply`, async () => {
    let card = {
      id: "m1",
      title: "Draft",
      description: "",
      status: "running",
      last_message_at: earlier,
    };
    const output: FeedOutput = {
      pushFeedItem() {},
      sessionStatus() {},
      async persistBoardStatus(_a, _s, status, _i, opts) {
        card = {
          ...card,
          ...applyActivityUpdate(
            card,
            { status },
            "2026-10-27T17:00:00.000Z",
            undefined,
            opts?.stamp,
          ),
        };
      },
    };
    const board = new TurnBoardWrites(output, "a", outcome);
    const state = newTurnState("a", outcome, output, { board });
    state.delivered = true;
    state.text = "Reply";
    if (outcome === "success") finishOk(state);
    else if (outcome === "provider")
      settleProviderErrorCard(state, {
        kind: "unauthenticated",
        provider: "anthropic",
        cause: "no_credentials",
        message: "Reconnect",
      });
    else
      finishErr(
        state,
        outcome === "stop"
          ? STOPPED_BY_USER
          : outcome === "died"
            ? TURN_DIED_MESSAGE
            : "Engine failed",
      );
    await board.settled;
    expect(card.status).toBe(
      outcome === "error" || outcome === "died" ? "error" : "needs_you",
    );
    expect(card.last_message_at).toBe(
      outcome === "success" ? "2026-10-27T17:00:00.000Z" : earlier,
    );
  });
}

test("observed sync, reply phases and successful settle never stamp", async () => {
  vi.useFakeTimers();
  const registry = new StreamRegistry();
  const writes: Parameters<FeedOutput["persistBoardStatus"]>[] = [];
  let emit: (frame: WireFrame) => void = () => {};
  const engine = {
    async streamEvents(_id: string, opts: EventStreamOptions) {
      emit = opts.onEvent;
      await new Promise<void>((resolve) =>
        opts.signal?.addEventListener("abort", () => resolve(), { once: true }),
      );
    },
    async getHistory() {
      return { id: "c", title: "", messages: [] };
    },
  } as unknown as HoustonEngineClient;
  const output: FeedOutput = {
    pushFeedItem() {},
    sessionStatus() {},
    async persistBoardStatus(...args) {
      writes.push(args);
    },
  };
  try {
    observeConversation(engine, "a", "observed-stamps", output, 0, registry);
    emit({
      type: "sync",
      data: { running: true, partial: "", seq: 0, turnId: "t1" },
    });
    await vi.advanceTimersByTimeAsync(0);
    emit({ type: "reply_complete", data: null, seq: 1, turnId: "t1" });
    await vi.advanceTimersByTimeAsync(0);
    emit({ type: "text", data: "More", seq: 2, turnId: "t1" });
    await vi.advanceTimersByTimeAsync(0);
    emit({ type: "done", data: null, seq: 3, turnId: "t1" });
    await vi.advanceTimersByTimeAsync(0);
    expect(writes.map((args) => args[2])).toEqual([
      "needs_you",
      "running",
      "needs_you",
    ]);
    expect(writes.map((args) => args[4]?.stamp)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  } finally {
    registry.disposeAll();
  }
});
