import type {
  EventStreamOptions,
  HoustonEngineClient,
  PendingInteraction,
  WireFrame,
} from "@houston/runtime-client";
import { afterEach, expect, test } from "vitest";
import { ScopeStore } from "../../store";
import { TurnBoardWrites } from "./board-writes";
import {
  type BoardPersistOptions,
  type FeedOutput,
  MultiplexFeedOutput,
} from "./feed-output";
import { finishResumed } from "./finish-resumed";
import { setReplyPhase } from "./reply-phase";
import { StreamRegistry } from "./stream-registry";
import { newTurnState } from "./turn-settle";
import { observeConversation, streamTurn } from "./turn-stream";
import {
  type ConversationVM,
  ConversationVmOutput,
  conversationScope,
} from "./vm-output";

/**
 * `reply_complete` hands the card back before `done`: an early provisional
 * `needs_you` persist (ordered behind the turn-start write), the VM's
 * `replyComplete` while the turn is still running, and the settle persist
 * still carrying the offers. Later work takes the card back.
 */

const AGENT = "Houston/Bo";
const registry = new StreamRegistry();
afterEach(() => registry.disposeAll());

const offers: PendingInteraction = {
  steps: [
    {
      kind: "suggest_actions",
      id: "s1",
      actions: [{ id: "a", label: "Another", message: "Do another" }],
    },
  ],
} as unknown as PendingInteraction;

/** A beat between frames: a live turn's frames are seconds apart, so each
 *  board write settles before the next frame arrives. */
const beat = () => new Promise((r) => setTimeout(r, 2));

/** One connection that replays `frames` with `turnId`, then closes. */
function engineWith(frames: WireFrame[], turnId = "t1") {
  const engine = {
    async streamEvents(_id: string, o: EventStreamOptions) {
      o.onEvent({
        type: "sync",
        data: { running: false, partial: "", seq: 0 },
      });
      for (const [i, f] of frames.entries()) {
        await beat();
        o.onEvent({ ...f, seq: i + 1, turnId });
      }
    },
    async sendMessage() {
      return { turnId };
    },
    async getHistory() {
      return { id: "c", title: "", messages: [] };
    },
  } as unknown as HoustonEngineClient;
  return engine;
}

type Persist = {
  status: string;
  interaction: PendingInteraction | null | undefined;
  provisional: boolean;
  vm?: ConversationVM;
};

/** Board persists in order, each with the VM as it stood right after. */
function recordingOutput(sessionKey: string) {
  const store = new ScopeStore();
  const vm = new ConversationVmOutput(store);
  const persists: Persist[] = [];
  const snapshot = () =>
    store.getSnapshot(conversationScope(AGENT, sessionKey)) as
      | ConversationVM
      | undefined;
  const board: FeedOutput = {
    pushFeedItem: () => {},
    sessionStatus: () => {},
    persistBoardStatus: async (
      _a,
      _s,
      status,
      interaction,
      opts?: BoardPersistOptions,
    ) => {
      persists.push({
        status,
        interaction,
        provisional: opts?.provisional === true,
        vm: snapshot(),
      });
    },
  };
  return {
    output: new MultiplexFeedOutput([vm, board]),
    persists,
    snapshot,
  };
}

const text = (data: string): WireFrame => ({ type: "text", data });
const replyComplete: WireFrame = { type: "reply_complete", data: null };
const offerStart: WireFrame = {
  type: "tool_start",
  data: { name: "mcp__houston__suggest_actions", args: {} },
};
const offerEnd: WireFrame = {
  type: "tool_end",
  data: { name: "mcp__houston__suggest_actions", isError: false },
};
const done: WireFrame = {
  type: "done",
  data: null,
  pendingInteraction: offers,
};

test("reply_complete persists needs_you early; done still carries the offers", async () => {
  const { output, persists } = recordingOutput("sk-early");
  await streamTurn(
    engineWith([
      text("Here it is."),
      replyComplete,
      offerStart,
      offerEnd,
      done,
    ]),
    AGENT,
    "sk-early",
    "hi",
    output,
    registry,
  );

  expect(
    persists.map(({ status, interaction, provisional }) => ({
      status,
      interaction,
      provisional,
    })),
  ).toEqual([
    { status: "running", interaction: null, provisional: false },
    { status: "needs_you", interaction: null, provisional: true },
    { status: "needs_you", interaction: offers, provisional: false },
  ]);
  // The early hand-back is not a settle: the VM keeps the turn running with
  // its board still "running" (the notification gate), but flags the reply.
  const early = persists[1]?.vm;
  expect(early?.running).toBe(true);
  expect(early?.boardStatus).toBe("running");
  expect(early?.replyComplete).toBe(true);
  const settled = persists[2]?.vm;
  expect(settled?.running).toBe(false);
  expect(settled?.boardStatus).toBe("needs_you");
  expect(settled?.replyComplete).toBeUndefined();
});

test("work after reply_complete takes the card back to running", async () => {
  const { output, persists } = recordingOutput("sk-more");
  await streamTurn(
    engineWith([
      text("Done."),
      replyComplete,
      text("\n\n"), // a block separator is not more work
      { type: "tool_start", data: { name: "Bash", args: {} } },
      text("Actually, one more thing."),
      done,
    ]),
    AGENT,
    "sk-more",
    "hi",
    output,
    registry,
  );

  expect(persists.map((p) => [p.status, p.provisional])).toEqual([
    ["running", false],
    ["needs_you", true],
    ["running", true],
    ["needs_you", false],
  ]);
  expect(persists[2]?.vm?.replyComplete).toBeUndefined();
  expect(persists[2]?.vm?.running).toBe(true);
});

/** An observed turn `t9` replaying `frames`, `gap` (or nothing) between them. */
function observedEngine(frames: WireFrame[], gap?: () => Promise<unknown>) {
  return {
    async streamEvents(_id: string, o: EventStreamOptions) {
      o.onEvent({
        type: "sync",
        data: { running: true, partial: "", seq: 0, turnId: "t9" },
      });
      for (const [i, f] of frames.entries()) {
        await gap?.();
        o.onEvent({ ...f, seq: i + 1, turnId: "t9" });
      }
    },
    async getHistory() {
      return { id: "c", title: "", messages: [] };
    },
  } as unknown as HoustonEngineClient;
}

test("an observed turn hands its card back early too", async () => {
  const { output, persists } = recordingOutput("sk-observed");
  const engine = observedEngine([text("Hi."), replyComplete, done], beat);

  observeConversation(engine, AGENT, "sk-observed", output, 0, registry);
  await new Promise((r) => setTimeout(r, 30));

  expect(persists.map((p) => [p.status, p.provisional])).toEqual([
    ["needs_you", true],
    ["needs_you", false],
  ]);
});

test("an early hand-back the settle already overtook is never written", async () => {
  // `done` lands in the same tick: the settle queued behind the forecast,
  // which would only flicker the card (and drop its offers for a beat).
  const { output, persists } = recordingOutput("sk-overtaken");
  const engine = observedEngine([text("Hi."), replyComplete, done]);

  observeConversation(engine, AGENT, "sk-overtaken", output, 0, registry);
  await new Promise((r) => setTimeout(r, 20));

  expect(persists.map((p) => [p.status, p.provisional])).toEqual([
    ["needs_you", false],
  ]);
});

test("an error after reply_complete still settles the card as an error", async () => {
  const { output, persists } = recordingOutput("sk-error");
  await streamTurn(
    engineWith([
      text("Here it is."),
      replyComplete,
      { type: "error", data: { message: "the engine crashed" } },
    ]),
    AGENT,
    "sk-error",
    "hi",
    output,
    registry,
  );

  expect(persists.map((p) => [p.status, p.provisional])).toEqual([
    ["running", false],
    ["needs_you", true],
    ["error", false],
  ]);
  expect(persists[2]?.vm?.boardStatus).toBe("error");
  expect(persists[2]?.vm?.replyComplete).toBeUndefined();
});

test("a resumed turn takes its early hand-back back", () => {
  const phases: boolean[] = [];
  const settles: string[] = [];
  const s = newTurnState(AGENT, "sk-resumed", recordingOutput("x").output, {
    board: {
      replyPhase: (complete) => phases.push(complete),
      settle: (status) => settles.push(status),
    },
  });
  setReplyPhase(s, true);
  finishResumed(s, "Houston restarted and is continuing.");
  // The engine runs the work again by itself: the card must read running.
  expect(phases).toEqual([true, false]);
  expect(settles).toEqual([]);
  expect(s.terminal).toBeNull();
});

test("a turn its predecessor's settle starts writes its card after that settle", async () => {
  // A send queued during the wrap-up flushes the moment the turn settles,
  // synchronously, while the settle's own card write is still to come. The
  // next turn's `running` must land after it, or the card reads "Needs you"
  // (with the previous turn's offers) for the whole next turn.
  const sk = "sk-next";
  const store = new ScopeStore();
  const vm = new ConversationVmOutput(store);
  const writes: string[] = [];
  let next: Promise<void> | undefined;
  const board: FeedOutput = {
    pushFeedItem: () => {},
    sessionStatus: (_a, _s, status) => {
      if (status !== "completed" || next) return;
      next = streamTurn(
        engineWith([text("Next."), done], "t2"),
        AGENT,
        sk,
        "and then?",
        output,
        registry,
      );
    },
    persistBoardStatus: async (_a, _s, status, interaction, opts) => {
      const tag = `${status}${opts?.provisional ? "*" : ""}${interaction ? "+offers" : ""}`;
      writes.push(`start:${tag}`);
      // The early hand-back is slow: still out when `done` arrives.
      await new Promise((r) => setTimeout(r, opts?.provisional ? 20 : 1));
      writes.push(`end:${tag}`);
    },
  };
  const output = new MultiplexFeedOutput([vm, board]);

  await streamTurn(
    engineWith([text("Here it is."), replyComplete, done]),
    AGENT,
    sk,
    "hi",
    output,
    registry,
  );
  await next;

  expect(writes).toEqual([
    "start:running",
    "end:running",
    "start:needs_you*",
    "end:needs_you*",
    "start:needs_you+offers",
    "end:needs_you+offers",
    "start:running",
    "end:running",
    "start:needs_you+offers",
    "end:needs_you+offers",
  ]);
});

test("a board write waits for the one before it", async () => {
  const order: string[] = [];
  let releaseStart: () => void = () => {};
  const output: FeedOutput = {
    pushFeedItem: () => {},
    sessionStatus: () => {},
    persistBoardStatus: (_a, _s, status, _i, opts) => {
      order.push(`start:${status}${opts?.provisional ? "*" : ""}`);
      if (status !== "running") return Promise.resolve();
      return new Promise<void>((resolve) => {
        releaseStart = () => {
          order.push("end:running");
          resolve();
        };
      });
    },
  };
  const board = new TurnBoardWrites(output, AGENT, "sk-order");
  void board.persist("running", null);
  board.replyPhase(true);
  await new Promise((r) => setTimeout(r, 5));
  // The slow start write still holds the line: nothing overtook it.
  expect(order).toEqual(["start:running"]);
  releaseStart();
  await new Promise((r) => setTimeout(r, 5));
  expect(order).toEqual(["start:running", "end:running", "start:needs_you*"]);
});

test("writes to one card queue across boards; other cards never wait", async () => {
  const order: string[] = [];
  let release: () => void = () => {};
  const output: FeedOutput = {
    pushFeedItem: () => {},
    sessionStatus: () => {},
    persistBoardStatus: (_a, sk, status) => {
      order.push(`${sk}:${status}`);
      if (sk !== "sk-a" || status !== "needs_you") return Promise.resolve();
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    },
  };
  const first = new TurnBoardWrites(output, AGENT, "sk-a");
  first.settle("needs_you", offers, undefined);
  const nextTurn = new TurnBoardWrites(output, AGENT, "sk-a");
  const next = nextTurn.persist("running", null);
  await new TurnBoardWrites(output, AGENT, "sk-b").persist("running", null);
  expect(order).toEqual(["sk-a:needs_you", "sk-b:running"]);
  release();
  await next;
  await first.settled;
  expect(order).toEqual(["sk-a:needs_you", "sk-b:running", "sk-a:running"]);
});

test("a write that never answers holds the card's queue only so long", async () => {
  const seen: string[] = [];
  const output: FeedOutput = {
    pushFeedItem: () => {},
    sessionStatus: () => {},
    persistBoardStatus: (_a, _s, status) => {
      seen.push(status);
      return status === "running"
        ? new Promise<void>(() => {})
        : Promise.resolve();
    },
  };
  const board = new TurnBoardWrites(output, AGENT, "sk-hung", 10);
  void board.persist("running", null);
  board.settle("needs_you", null, undefined);
  await board.settled;
  expect(seen).toEqual(["running", "needs_you"]);
});

test("a failed write never stalls the ones behind it", async () => {
  const seen: string[] = [];
  const output: FeedOutput = {
    pushFeedItem: () => {},
    sessionStatus: () => {},
    persistBoardStatus: async (_a, _s, status) => {
      seen.push(status);
      if (status === "running") throw new Error("offline");
    },
  };
  const board = new TurnBoardWrites(output, AGENT, "sk-failed");
  await expect(board.persist("running", null)).rejects.toThrow("offline");
  await board.persist("needs_you", null);
  expect(seen).toEqual(["running", "needs_you"]);
});
