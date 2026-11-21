import type {
  EventStreamOptions,
  HoustonEngineClient,
  WireFrame,
} from "@houston/runtime-client";
import { EngineError } from "@houston/runtime-client";
import { afterEach, expect, test, vi } from "vitest";
import { ScopeStore } from "../../store";
import type { FeedOutput } from "./feed-output";
import { MultiplexFeedOutput } from "./feed-output";
import { PersonStop } from "./person-stop";
import {
  COMPUTE_BUSY_MESSAGE,
  computeBusyRefusal,
  SEND_BUSY_NOTICE_MS,
  SEND_BUSY_WAIT_MS,
  SendBusyClock,
} from "./send-busy";
import { sendHolding } from "./send-hold";
import { armHandoffStop } from "./send-wait";
import {
  SEND_IN_FLIGHT_MESSAGE,
  StreamRegistry,
  streamKey,
} from "./stream-registry";
import { STOPPED_BY_USER } from "./turn-errors";
import {
  observeConversation,
  type StreamTuning,
  streamTurn,
} from "./turn-stream";
import {
  type ConversationVM,
  ConversationVmOutput,
  conversationScope,
} from "./vm-output";

const busy = (retryAfterMs = 1) =>
  new EngineError(
    503,
    JSON.stringify({
      error: "engine unavailable",
      code: "compute_busy",
      detail: "sandbox_queue_timeout",
      retryAfterMs,
    }),
  );

const noEvidence = {
  turnEnds: 0,
  turnEndAfter: () => new Promise<void>(() => {}),
};

async function waitFor(cond: () => boolean, ms = 3_000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 2));
  }
}

test("only the gateway's compute_busy 503 reads as busy", () => {
  expect(computeBusyRefusal(busy())?.detail).toBe("sandbox_queue_timeout");
  const waking = new EngineError(
    503,
    JSON.stringify({ error: "engine unavailable", detail: "agent is waking" }),
  );
  expect(computeBusyRefusal(waking)).toBeNull();
  const refused = new EngineError(
    503,
    JSON.stringify({ error: "engine unavailable", code: "pod_wake_refused" }),
  );
  expect(computeBusyRefusal(refused)).toBeNull();
  expect(computeBusyRefusal(new Error("Load failed"))).toBeNull();
});

test("the busy clock honors the server's hint inside its bounds and its budget", () => {
  const clock = new SendBusyClock(undefined);
  const refusal = (retryAfterMs?: number) => ({
    code: "compute_busy" as const,
    error: "engine unavailable",
    retryAfterMs,
  });
  expect(clock.pauseFor(refusal(3_000))).toBe(3_000);
  expect(clock.pauseFor(refusal(1))).toBe(1_000);
  expect(clock.pauseFor(refusal(600_000))).toBe(30_000);
  expect(clock.pauseFor(refusal())).toBe(3_000);
  expect(clock.spent).toBe(false);
  expect(SEND_BUSY_WAIT_MS).toBe(600_000);
  expect(SEND_BUSY_NOTICE_MS).toBe(15_000);
  expect(
    new SendBusyClock({ sendBusyWaitMs: 0 }).pauseFor(refusal(3_000)),
  ).toBe(0);
});

test("a busy send goes out again, the same request, until it is admitted", async () => {
  let calls = 0;
  let busyCalls = 0;
  const accepted = await sendHolding(
    async () => {
      calls++;
      if (calls < 3) throw busy();
      return { turnId: "t-1" };
    },
    noEvidence,
    new AbortController().signal,
    { sendBusyNoticeMs: 0 },
    { onHold: () => {}, onBusy: () => busyCalls++ },
  );
  expect(accepted).toEqual({ turnId: "t-1" });
  expect(calls).toBe(3);
  expect(busyCalls).toBe(1);
});

test("a busy send is held, so the waiting stream's frames are not its turn's", async () => {
  let holds = 0;
  let calls = 0;
  await sendHolding(
    async () => {
      if (++calls < 3) throw busy();
      return {};
    },
    noEvidence,
    new AbortController().signal,
    undefined,
    { onHold: () => holds++ },
  );
  expect(holds).toBe(2);
});

test("a busy send says so only once the wait is long", async () => {
  let calls = 0;
  let busyCalls = 0;
  await sendHolding(
    async () => {
      if (++calls < 2) throw busy();
      return {};
    },
    noEvidence,
    new AbortController().signal,
    { sendBusyNoticeMs: 60_000 },
    { onHold: () => {}, onBusy: () => busyCalls++ },
  );
  expect(busyCalls).toBe(0);
});

test("the busy line comes on time, while the re-send is still waiting", async () => {
  const ac = new AbortController();
  let busyAt = 0;
  const started = Date.now();
  const sending = sendHolding(
    async () => {
      throw busy(5_000);
    },
    noEvidence,
    ac.signal,
    { sendBusyNoticeMs: 20 },
    {
      onHold: () => {},
      onBusy: () => {
        busyAt ||= Date.now();
      },
    },
  ).catch(() => {});
  await waitFor(() => busyAt > 0, 1_000);
  ac.abort();
  await sending;
  expect(busyAt - started).toBeLessThan(1_000);
});

test("a busy refusal never re-sends past the budget, even after a long hint", async () => {
  let calls = 0;
  const refusal = await sendHolding(
    async () => {
      calls++;
      throw busy(5_000);
    },
    noEvidence,
    new AbortController().signal,
    { sendBusyWaitMs: 30 },
    { onHold: () => {} },
  ).catch((e: unknown) => e);
  expect(computeBusyRefusal(refusal)).not.toBeNull();
  expect(calls).toBe(1);
});

const registry = new StreamRegistry();
afterEach(() => registry.disposeAll());

const fast: StreamTuning = {
  idleTimeoutMs: 2_000,
  backoff: { initialMs: 1, maxMs: 2, jitter: () => 0 },
};

const sync = (running: boolean, seq: number): WireFrame => ({
  type: "sync",
  data: { running, partial: "", seq },
  seq,
});

type Stream = (o: EventStreamOptions) => Promise<void>;

const untilAborted: Stream = (o) =>
  new Promise<void>((resolve) => {
    if (o.signal?.aborted) return resolve();
    o.signal?.addEventListener("abort", () => resolve(), { once: true });
  });

function busyEngine(refusals: number, ...streams: Stream[]) {
  const nonces: Array<string | undefined> = [];
  let connections = 0;
  const engine = {
    streamEvents: (_id: string, o: EventStreamOptions) =>
      (streams[Math.min(connections++, streams.length - 1)] ?? untilAborted)(o),
    async sendMessage(_id: string, _text: string, o?: { nonce?: string }) {
      nonces.push(o?.nonce);
      if (nonces.length <= refusals) throw busy();
    },
    async getHistory() {
      return { id: "c", title: "", messages: [] };
    },
  } as unknown as HoustonEngineClient;
  return { engine, nonces };
}

function vmOutput() {
  const store = new ScopeStore();
  const output: FeedOutput = new MultiplexFeedOutput([
    new ConversationVmOutput(store),
  ]);
  const snapshot = (key: string) =>
    store.getSnapshot(conversationScope("Houston/Bo", key)) as ConversationVM;
  return { output, snapshot };
}

function reply(o: EventStreamOptions, nonce: string | undefined, seq: number) {
  o.onEvent({
    type: "user",
    data: { content: "hi", ts: 1, nonce },
    turnId: "t-mine",
    seq,
  });
  o.onEvent({ type: "text", data: "Done", turnId: "t-mine", seq: seq + 1 });
  o.onEvent({ type: "done", data: null, turnId: "t-mine", seq: seq + 2 });
}

test("the VM shows a long busy wait, then clears it once the send lands", async () => {
  const { output, snapshot } = vmOutput();
  let sawBusy = false;
  const { engine, nonces } = busyEngine(2, async (o) => {
    o.onEvent(sync(false, 0));
    o.onEvent({ type: "done", data: null, turnId: "t-other", seq: 1 });
    await waitFor(() => {
      if (snapshot("activity-busy")?.sendWaiting === "busy") sawBusy = true;
      return nonces.length === 3;
    });
    reply(o, nonces[2], 2);
  });

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-busy",
    "hi",
    output,
    registry,
    { tuning: { ...fast, sendBusyNoticeMs: 0 } },
  );

  expect(sawBusy).toBe(true);
  expect(new Set(nonces).size).toBe(1);
  const vm = snapshot("activity-busy");
  expect(vm.sendWaiting).toBeUndefined();
  expect(vm.sessionStatus).toBe("completed");
  expect(vm.feed.some((f) => f.data === "Done")).toBe(true);
});

test("a busy send past its budget settles with the typed notice, not an error message", async () => {
  const { output, snapshot } = vmOutput();
  const { engine } = busyEngine(Number.POSITIVE_INFINITY, async (o) => {
    o.onEvent(sync(false, 0));
    await untilAborted(o);
  });

  await streamTurn(
    engine,
    "Houston/Bo",
    "activity-busy-out",
    "hi",
    output,
    registry,
    { tuning: { ...fast, sendBusyWaitMs: 20, sendBusyNoticeMs: 0 } },
  );

  const vm = snapshot("activity-busy-out");
  expect(vm.sendWaiting).toBeUndefined();
  const note = vm.feed.find((f) => f.feed_type === "system_message");
  expect(note?.data).toBe(COMPUTE_BUSY_MESSAGE);
  expect(note?.notice).toBe("compute_busy");
});

test("a busy refusal on the observer handoff is re-sent, held, on the fresh path", async () => {
  const { output, snapshot } = vmOutput();
  const key = "activity-busy-handoff";
  const { engine, nonces } = busyEngine(
    1,
    async (o) => {
      o.onEvent(sync(false, 3));
      await untilAborted(o);
    },
    async (o) => {
      await waitFor(() => nonces.length === 2);
      reply(o, nonces[1], 4);
    },
  );

  observeConversation(engine, "Houston/Bo", key, output, 1, registry, fast);
  await waitFor(
    () => registry.get(streamKey("Houston/Bo", key))?.kind === "observer",
  );
  await streamTurn(engine, "Houston/Bo", key, "hi", output, registry, {
    tuning: fast,
  });

  expect(nonces).toHaveLength(2);
  expect(new Set(nonces).size).toBe(1);
  const vm = snapshot(key);
  expect(vm.feed.some((f) => f.feed_type === "system_message")).toBe(false);
  expect(vm.sessionStatus).toBe("completed");
});

test("a handoff's busy refusal is waited out, held, before the first re-send", async () => {
  const { output, snapshot } = vmOutput();
  const key = "activity-busy-handoff-wait";
  const sentAt: number[] = [];
  const { engine, nonces } = busyEngine(
    1,
    async (o) => {
      o.onEvent(sync(false, 3));
      await untilAborted(o);
    },
    async (o) => {
      o.onEvent(sync(false, 3));
      await waitFor(() => nonces.length === 2);
      reply(o, nonces[1], 4);
    },
  );
  const send = engine.sendMessage.bind(engine);
  engine.sendMessage = (async (...args: Parameters<typeof send>) => {
    sentAt.push(Date.now());
    return send(...args);
  }) as typeof engine.sendMessage;

  observeConversation(engine, "Houston/Bo", key, output, 1, registry, fast);
  await waitFor(
    () => registry.get(streamKey("Houston/Bo", key))?.kind === "observer",
  );
  await streamTurn(engine, "Houston/Bo", key, "hi", output, registry, {
    tuning: fast,
  });

  expect(sentAt).toHaveLength(2);
  expect(sentAt[1] - sentAt[0]).toBeGreaterThanOrEqual(900);
  expect(snapshot(key).sessionStatus).toBe("completed");
});

test("Stop ends a message still waiting for room: no re-send after it", async () => {
  const { output, snapshot } = vmOutput();
  const key = "activity-busy-stop";
  const { engine, nonces } = busyEngine(Number.POSITIVE_INFINITY, async (o) => {
    o.onEvent(sync(false, 0));
    await untilAborted(o);
  });

  const turn = streamTurn(engine, "Houston/Bo", key, "hi", output, registry, {
    tuning: { ...fast, sendBusyNoticeMs: 0 },
  });
  await waitFor(() => snapshot(key)?.sendWaiting === "busy");
  const finish = registry.stopUnsent(streamKey("Houston/Bo", key));
  expect(finish).not.toBeNull();
  const sends = nonces.length;
  await new Promise((r) => setTimeout(r, 1_200));
  expect(snapshot(key).boardStatus).not.toBe("needs_you");
  expect(registry.get(streamKey("Houston/Bo", key))?.held).toBe(true);
  finish?.();
  await turn;

  expect(nonces.length).toBe(sends);
  const vm = snapshot(key);
  expect(vm.sendWaiting).toBeUndefined();
  expect(vm.boardStatus).toBe("needs_you");
  expect(vm.feed.some((f) => f.data === STOPPED_BY_USER)).toBe(true);
});

test("Stop leaves an accepted turn to the engine's own cancel", async () => {
  const { output } = vmOutput();
  const key = "activity-accepted-stop";
  let accepted = false;
  const { engine } = busyEngine(0, async (o) => {
    o.onEvent(sync(false, 0));
    await waitFor(() => accepted);
    await untilAborted(o);
  });
  const sendMessage = engine.sendMessage.bind(engine);
  engine.sendMessage = (async (...args: Parameters<typeof sendMessage>) => {
    const answer = await sendMessage(...args);
    accepted = true;
    return answer;
  }) as typeof engine.sendMessage;

  void streamTurn(engine, "Houston/Bo", key, "hi", output, registry, {
    tuning: fast,
  });
  await waitFor(() => accepted);
  await new Promise((r) => setTimeout(r, 10));
  expect(registry.stopUnsent(streamKey("Houston/Bo", key))).toBeNull();
});

test("a teardown takes the busy line down at once", async () => {
  const { output, snapshot } = vmOutput();
  const key = "activity-busy-teardown";
  const { engine } = busyEngine(Number.POSITIVE_INFINITY, async (o) => {
    o.onEvent(sync(false, 0));
    await untilAborted(o);
  });

  const turn = streamTurn(engine, "Houston/Bo", key, "hi", output, registry, {
    tuning: { ...fast, sendBusyNoticeMs: 0 },
  });
  await waitFor(() => snapshot(key)?.sendWaiting === "busy");
  registry.disposeAll();
  expect(snapshot(key).sendWaiting).toBeUndefined();
  await turn;
  await new Promise((r) => setTimeout(r, 50));
  expect(snapshot(key).sendWaiting).toBeUndefined();
});

test("Stop reaches the observer handoff's send while it is still out", async () => {
  const { output, snapshot } = vmOutput();
  const key = "activity-handoff-stop";
  let posts = 0;
  const { engine } = busyEngine(0, async (o) => {
    o.onEvent(sync(false, 3));
    await untilAborted(o);
  });
  engine.sendMessage = ((
    _id: string,
    _text: string,
    o?: { signal?: AbortSignal },
  ) => {
    posts++;
    return new Promise((_resolve, reject) => {
      o?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("aborted", "AbortError")),
        { once: true },
      );
    });
  }) as typeof engine.sendMessage;

  observeConversation(engine, "Houston/Bo", key, output, 1, registry, fast);
  await waitFor(
    () => registry.get(streamKey("Houston/Bo", key))?.kind === "observer",
  );
  const turn = streamTurn(engine, "Houston/Bo", key, "hi", output, registry, {
    tuning: fast,
  });
  await waitFor(() => posts === 1);
  const finish = registry.stopUnsent(streamKey("Houston/Bo", key));
  expect(finish).not.toBeNull();
  finish?.();
  await turn;
  await new Promise((r) => setTimeout(r, 1_200));

  expect(posts).toBe(1);
  const vm = snapshot(key);
  expect(vm.boardStatus).toBe("needs_you");
  expect(vm.feed.some((f) => f.data === STOPPED_BY_USER)).toBe(true);
});

test("a stream that keeps failing while the send waits for room never ends the turn", async () => {
  const { output, snapshot } = vmOutput();
  const key = "activity-busy-stream-refused";
  let nonceSeen: () => string | undefined = () => undefined;
  let accepted = false;
  let connections = 0;
  const refusedStream: Stream = async () => {
    connections++;
    throw new EngineError(
      503,
      JSON.stringify({ error: "engine unavailable", code: "pod_wake_refused" }),
    );
  };
  const { engine, nonces } = busyEngine(2, async (o) => {
    if (!accepted) return refusedStream(o);
    o.onEvent(sync(false, 0));
    reply(o, nonceSeen(), 1);
  });
  nonceSeen = () => nonces[2];
  const send = engine.sendMessage.bind(engine);
  engine.sendMessage = (async (...args: Parameters<typeof send>) => {
    const answer = await send(...args);
    accepted = true;
    return answer;
  }) as typeof engine.sendMessage;

  await streamTurn(engine, "Houston/Bo", key, "hi", output, registry, {
    tuning: {
      ...fast,
      backoff: { initialMs: 5, maxMs: 10, jitter: (cap) => cap },
    },
  });

  expect(connections).toBeGreaterThan(8);
  expect(snapshot(key).sessionStatus).toBe("completed");
});

const podWakeRefused = () =>
  new EngineError(
    503,
    JSON.stringify({ error: "engine unavailable", code: "pod_wake_refused" }),
  );

const paced: StreamTuning = {
  ...fast,
  backoff: { initialMs: 5, maxMs: 10, jitter: (cap) => cap },
};

test("a stream that fails while the first send is still out never ends the turn", async () => {
  const { output, snapshot } = vmOutput();
  const key = "activity-first-send-stream-refused";
  let accepted = false;
  let failures = 0;
  const { engine, nonces } = busyEngine(0, async (o) => {
    if (!accepted) {
      failures++;
      throw podWakeRefused();
    }
    o.onEvent(sync(false, 0));
    reply(o, nonces[0], 1);
  });
  const send = engine.sendMessage.bind(engine);
  engine.sendMessage = (async (...args: Parameters<typeof send>) => {
    await waitFor(() => failures > 12);
    const answer = await send(...args);
    accepted = true;
    return answer;
  }) as typeof engine.sendMessage;

  await streamTurn(engine, "Houston/Bo", key, "hi", output, registry, {
    tuning: paced,
  });

  expect(snapshot(key).sessionStatus).toBe("completed");
});

test("once the send is taken, a frame gives the stream its own budget, no more", async () => {
  const { output } = vmOutput();
  const key = "activity-stream-budget-reset";
  let accepted = false;
  let framed = false;
  let failedWaiting = 0;
  let failedAfter = 0;
  const { engine } = busyEngine(1, async (o) => {
    if (!accepted) {
      failedWaiting++;
      throw podWakeRefused();
    }
    if (!framed) {
      framed = true;
      o.onEvent(sync(true, 1));
      return;
    }
    failedAfter++;
    throw podWakeRefused();
  });
  const send = engine.sendMessage.bind(engine);
  engine.sendMessage = (async (...args: Parameters<typeof send>) => {
    const answer = await send(...args);
    accepted = true;
    return answer;
  }) as typeof engine.sendMessage;

  await streamTurn(engine, "Houston/Bo", key, "hi", output, registry, {
    tuning: paced,
  });

  expect(failedWaiting).toBeGreaterThan(8);
  expect(failedAfter).toBe(8);
});

test("a Stop waits for the engine's cancel to answer, however long it takes", async () => {
  vi.useFakeTimers();
  try {
    const stops = new StreamRegistry();
    const handoff = armHandoffStop(stops, "k", () => {});
    const finish = stops.stopUnsent("k");
    expect(finish).not.toBeNull();
    let answered = false;
    void handoff
      .stopped()
      ?.settleWith(() => {})
      .then(() => {
        answered = true;
      });
    await vi.advanceTimersByTimeAsync(120_000);
    expect(answered).toBe(false);
    finish?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(answered).toBe(true);
    handoff.disarm();
  } finally {
    vi.useRealTimers();
  }
});

test("a send waiting for room reads as held, so the queue watchdog leaves it", async () => {
  const { output } = vmOutput();
  const key = "activity-busy-held";
  const entry = () => registry.get(streamKey("Houston/Bo", key));
  let heldWhileWaiting = false;
  const { engine, nonces } = busyEngine(1, async (o) => {
    o.onEvent(sync(false, 0));
    await waitFor(() => {
      if (nonces.length === 1 && entry()?.held === true)
        heldWhileWaiting = true;
      return nonces.length === 2;
    });
    await waitFor(() => entry()?.held === false);
    reply(o, nonces[1], 1);
  });

  await streamTurn(engine, "Houston/Bo", key, "hi", output, registry, {
    tuning: fast,
  });

  expect(heldWhileWaiting).toBe(true);
});

test("a stopped handoff streams nothing and stays held until the cancel answered", async () => {
  const { output, snapshot } = vmOutput();
  const key = "activity-handoff-stop-wait";
  let connections = 0;
  const { engine } = busyEngine(
    0,
    async (o) => {
      connections++;
      o.onEvent({
        type: "sync",
        data: { running: true, partial: "", turnId: "t-prev", seq: 3 },
        seq: 3,
      });
      await untilAborted(o);
    },
    async (o) => {
      connections++;
      o.onEvent({
        type: "sync",
        data: { running: false, partial: "", resync: true, seq: 4 },
        seq: 4,
      });
      await untilAborted(o);
    },
  );
  let posted = false;
  engine.sendMessage = ((
    _id: string,
    _text: string,
    o?: { signal?: AbortSignal },
  ) => {
    posted = true;
    return new Promise((_resolve, reject) => {
      o?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("aborted", "AbortError")),
        { once: true },
      );
    });
  }) as typeof engine.sendMessage;

  observeConversation(engine, "Houston/Bo", key, output, 1, registry, fast);
  await waitFor(
    () => registry.get(streamKey("Houston/Bo", key))?.kind === "observer",
  );
  const turn = streamTurn(engine, "Houston/Bo", key, "hi", output, registry, {
    tuning: fast,
  });
  await waitFor(() => posted);
  const finish = registry.stopUnsent(streamKey("Houston/Bo", key));
  await waitFor(
    () => registry.get(streamKey("Houston/Bo", key))?.kind === "turn",
  );
  await new Promise((r) => setTimeout(r, 100));

  expect(connections).toBe(1);
  expect(registry.get(streamKey("Houston/Bo", key))?.held).toBe(true);
  expect(snapshot(key).boardStatus).not.toBe("needs_you");
  expect(snapshot(key).boardStatus).not.toBe("error");
  finish?.();
  await turn;

  const vm = snapshot(key);
  expect(vm.boardStatus).toBe("needs_you");
  expect(vm.feed.some((f) => f.data === STOPPED_BY_USER)).toBe(true);
});

test("a Stop during the first send holds the turn until the cancel answered", async () => {
  const { output, snapshot } = vmOutput();
  const key = "activity-first-send-stop";
  const { engine } = busyEngine(0, async (o) => {
    o.onEvent(sync(false, 0));
    await untilAborted(o);
  });
  let posted = false;
  engine.sendMessage = ((
    _id: string,
    _text: string,
    o?: { signal?: AbortSignal },
  ) => {
    posted = true;
    return new Promise((_resolve, reject) => {
      o?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("aborted", "AbortError")),
        { once: true },
      );
    });
  }) as typeof engine.sendMessage;

  const turn = streamTurn(engine, "Houston/Bo", key, "hi", output, registry, {
    tuning: fast,
  });
  await waitFor(() => posted);
  const finish = registry.stopUnsent(streamKey("Houston/Bo", key));
  await new Promise((r) => setTimeout(r, 50));
  expect(registry.get(streamKey("Houston/Bo", key))?.held).toBe(true);
  expect(snapshot(key).boardStatus).not.toBe("needs_you");
  finish?.();
  await turn;

  expect(snapshot(key).feed.some((f) => f.data === STOPPED_BY_USER)).toBe(true);
});

test("a handoff's busy wait counts from when its send went out", async () => {
  expect(
    new SendBusyClock({ sendBusyWaitMs: 1_000 }, Date.now() - 1_000).spent,
  ).toBe(true);
  let busyCalls = 0;
  let sends = 0;
  const started = Date.now();
  const refusal = await sendHolding(
    async () => {
      sends++;
      return {};
    },
    noEvidence,
    new AbortController().signal,
    { sendBusyNoticeMs: 50, sendBusyWaitMs: 1_000 },
    {
      onHold: () => {},
      onBusy: () => busyCalls++,
      firstRefusal: busy(),
      busySince: Date.now() - 900,
    },
  ).catch((e: unknown) => e);
  expect(computeBusyRefusal(refusal)).not.toBeNull();
  expect(sends).toBe(0);
  expect(busyCalls).toBe(1);
  expect(Date.now() - started).toBeLessThan(500);
});

test("a teardown aborts the busy re-send still out, and a late refusal settles nothing", async () => {
  const { output, snapshot } = vmOutput();
  const key = "activity-busy-teardown-late";
  const persisted: string[] = [];
  output.persistBoardStatus = async (_agent, _session, status) => {
    persisted.push(status);
  };
  const { engine } = busyEngine(0, async (o) => {
    o.onEvent(sync(false, 0));
    await untilAborted(o);
  });
  let calls = 0;
  let outSignal: AbortSignal | undefined;
  engine.sendMessage = (async (
    _id: string,
    _text: string,
    o?: { signal?: AbortSignal },
  ) => {
    if (++calls === 1) throw busy();
    outSignal = o?.signal;
    await new Promise((r) => setTimeout(r, 100));
    throw busy();
  }) as typeof engine.sendMessage;

  const turn = streamTurn(engine, "Houston/Bo", key, "hi", output, registry, {
    tuning: fast,
  });
  await waitFor(() => outSignal !== undefined);
  const persistedBefore = persisted.length;
  registry.disposeAll();
  expect(outSignal?.aborted).toBe(true);
  await turn;

  expect(persisted.slice(persistedBefore)).toEqual([]);
  expect(snapshot(key).feed.some((f) => f.feed_type === "system_message")).toBe(
    false,
  );
});

test("the fresh path's busy budget includes the handoff send's queue wait", async () => {
  const { output, snapshot } = vmOutput();
  const key = "activity-handoff-busy-since";
  const { engine } = busyEngine(0, async (o) => {
    o.onEvent(sync(false, 3));
    await untilAborted(o);
  });
  let sends = 0;
  engine.sendMessage = (async () => {
    if (++sends === 1) await new Promise((r) => setTimeout(r, 1_100));
    throw busy();
  }) as typeof engine.sendMessage;

  observeConversation(engine, "Houston/Bo", key, output, 1, registry, fast);
  await waitFor(
    () => registry.get(streamKey("Houston/Bo", key))?.kind === "observer",
  );
  await streamTurn(engine, "Houston/Bo", key, "hi", output, registry, {
    tuning: { ...fast, sendBusyWaitMs: 1_200 },
  });

  expect(sends).toBe(1);
  const note = snapshot(key).feed.find((f) => f.feed_type === "system_message");
  expect(note?.notice).toBe("compute_busy");
});

test("an idle resync while the first send is still out settles nothing", async () => {
  const { output, snapshot } = vmOutput();
  const key = "activity-first-send-resync";
  const { engine, nonces } = busyEngine(
    1,
    async (o) => {
      o.onEvent(sync(false, 0));
      throw new Error("Load failed");
    },
    async (o) => {
      o.onEvent({
        type: "sync",
        data: { running: false, partial: "", resync: true, seq: 1 },
        seq: 1,
      });
      await waitFor(() => nonces.length === 2);
      reply(o, nonces[1], 2);
    },
  );
  const send = engine.sendMessage.bind(engine);
  let first = true;
  engine.sendMessage = (async (...args: Parameters<typeof send>) => {
    if (first) {
      first = false;
      await new Promise((r) => setTimeout(r, 300));
    }
    return send(...args);
  }) as typeof engine.sendMessage;

  await streamTurn(engine, "Houston/Bo", key, "hi", output, registry, {
    tuning: fast,
  });

  expect(nonces).toHaveLength(2);
  const vm = snapshot(key);
  expect(vm.feed.some((f) => f.feed_type === "system_message")).toBe(false);
  expect(vm.sessionStatus).toBe("completed");
});

test("a Stop that races the engine's acceptance settles nothing before the cancel answered", async () => {
  const { output, snapshot } = vmOutput();
  const key = "activity-stop-races-accept";
  let stopped = false;
  let nonce: string | undefined;
  const { engine } = busyEngine(0, async (o) => {
    o.onEvent(sync(false, 0));
    await waitFor(() => stopped);
    reply(o, nonce, 1);
    await untilAborted(o);
  });
  engine.sendMessage = ((
    _id: string,
    _text: string,
    o?: { nonce?: string; signal?: AbortSignal },
  ) => {
    nonce = o?.nonce;
    return new Promise((_resolve, reject) => {
      o?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("aborted", "AbortError")),
        { once: true },
      );
    });
  }) as typeof engine.sendMessage;

  const turn = streamTurn(engine, "Houston/Bo", key, "hi", output, registry, {
    tuning: fast,
  });
  await waitFor(() => nonce !== undefined);
  const finish = registry.stopUnsent(streamKey("Houston/Bo", key));
  stopped = true;
  await new Promise((r) => setTimeout(r, 100));
  expect(snapshot(key).sessionStatus).toBe("running");
  finish?.();
  await turn;

  const vm = snapshot(key);
  expect(vm.boardStatus).toBe("needs_you");
  expect(vm.feed.some((f) => f.data === STOPPED_BY_USER)).toBe(true);
});

test("a history settle a Stop overtook publishes nothing", async () => {
  const { output, snapshot } = vmOutput();
  const key = "activity-stop-overtakes-reload";
  let nonce: string | undefined;
  let reloading = false;
  let answerHistory: (messages: unknown[]) => void = () => {};
  const { engine } = busyEngine(
    0,
    async (o) => {
      o.onEvent(sync(false, 0));
      await waitFor(() => nonce !== undefined);
      o.onEvent({
        type: "user",
        data: { content: "hi", ts: 1, nonce },
        turnId: "t-mine",
        seq: 1,
      });
      throw new Error("Load failed");
    },
    async (o) => {
      o.onEvent({
        type: "sync",
        data: { running: false, partial: "", resync: true, seq: 2 },
        seq: 2,
      });
      await untilAborted(o);
    },
  );
  engine.sendMessage = ((
    _id: string,
    _text: string,
    o?: { nonce?: string; signal?: AbortSignal },
  ) => {
    nonce = o?.nonce;
    return new Promise((_resolve, reject) => {
      o?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("aborted", "AbortError")),
        { once: true },
      );
    });
  }) as typeof engine.sendMessage;
  engine.getHistory = (() => {
    reloading = true;
    return new Promise((resolve) => {
      answerHistory = (messages) =>
        resolve({ id: "c", title: "", messages } as never);
    });
  }) as typeof engine.getHistory;

  const turn = streamTurn(engine, "Houston/Bo", key, "hi", output, registry, {
    tuning: fast,
  });
  await waitFor(() => reloading);
  const finish = registry.stopUnsent(streamKey("Houston/Bo", key));
  answerHistory([
    { role: "user", content: "hi", turnId: "t-mine" },
    { role: "assistant", content: "Done", turnId: "t-mine" },
  ]);
  await new Promise((r) => setTimeout(r, 100));
  expect(snapshot(key).sessionStatus).toBe("running");
  finish?.();
  await turn;

  const vm = snapshot(key);
  expect(vm.boardStatus).toBe("needs_you");
  expect(vm.feed.some((f) => f.data === STOPPED_BY_USER)).toBe(true);
});

function acceptThenStop(
  key: string,
  onStop: (finish: (() => void) | null) => void,
) {
  return ((_id: string, _text: string, o?: { nonce?: string }) =>
    new Promise((resolve) => {
      setTimeout(() => {
        resolve({ turnId: "t-mine" });
        onStop(registry.stopUnsent(streamKey("Houston/Bo", key)));
      }, 10);
      void o;
    })) as unknown as HoustonEngineClient["sendMessage"];
}

const settledWithin = (turn: Promise<void>, ms: number) =>
  Promise.race([
    turn.then(() => true),
    new Promise<boolean>((r) => setTimeout(() => r(false), ms)),
  ]);

test("a Stop in the same tick as the 202 still wins on the fresh path", async () => {
  const { output, snapshot } = vmOutput();
  const key = "activity-stop-same-tick";
  let finish: (() => void) | null = null;
  let stopped = false;
  const { engine } = busyEngine(0, async (o) => {
    o.onEvent(sync(false, 0));
    await waitFor(() => stopped);
    reply(o, undefined, 1);
    await untilAborted(o);
  });
  engine.sendMessage = acceptThenStop(key, (f) => {
    finish = f;
    stopped = true;
  });

  const turn = streamTurn(engine, "Houston/Bo", key, "hi", output, registry, {
    tuning: fast,
  });
  await waitFor(() => stopped);
  expect(finish).not.toBeNull();
  await new Promise((r) => setTimeout(r, 100));
  expect(snapshot(key).sessionStatus).toBe("running");
  expect(registry.get(streamKey("Houston/Bo", key))?.held).toBe(true);
  (finish as (() => void) | null)?.();

  expect(await settledWithin(turn, 2_000)).toBe(true);
  expect(snapshot(key).feed.some((f) => f.data === STOPPED_BY_USER)).toBe(true);
});

test("a Stop in the same tick as the handoff's 202 still wins", async () => {
  const { output, snapshot } = vmOutput();
  const key = "activity-handoff-stop-same-tick";
  let finish: (() => void) | null = null;
  let stopped = false;
  let connections = 0;
  const { engine } = busyEngine(
    0,
    async (o) => {
      connections++;
      o.onEvent(sync(false, 3));
      await untilAborted(o);
    },
    async (o) => {
      connections++;
      reply(o, undefined, 4);
      await untilAborted(o);
    },
  );
  engine.sendMessage = acceptThenStop(key, (f) => {
    finish = f;
    stopped = true;
  });

  observeConversation(engine, "Houston/Bo", key, output, 1, registry, fast);
  await waitFor(
    () => registry.get(streamKey("Houston/Bo", key))?.kind === "observer",
  );
  const turn = streamTurn(engine, "Houston/Bo", key, "hi", output, registry, {
    tuning: fast,
  });
  await waitFor(() => stopped);
  expect(finish).not.toBeNull();
  await new Promise((r) => setTimeout(r, 100));
  expect(connections).toBe(1);
  expect(snapshot(key).sessionStatus).not.toBe("completed");
  expect(registry.get(streamKey("Houston/Bo", key))?.held).toBe(true);
  (finish as (() => void) | null)?.();

  expect(await settledWithin(turn, 2_000)).toBe(true);
  expect(snapshot(key).feed.some((f) => f.data === STOPPED_BY_USER)).toBe(true);
});

test("an observer's reload still out when a busy send takes over publishes nothing", async () => {
  const { output, snapshot } = vmOutput();
  const key = "activity-observer-reload-busy";
  let answerHistory: (messages: unknown[]) => void = () => {};
  let reloads = 0;
  const { engine, nonces } = busyEngine(
    1,
    async (o) => {
      o.onEvent({
        type: "sync",
        data: { running: true, partial: "", turnId: "t-prev", seq: 3 },
        seq: 3,
      });
      throw new Error("Load failed");
    },
    async (o) => {
      o.onEvent({
        type: "sync",
        data: { running: false, partial: "", resync: true, seq: 4 },
        seq: 4,
      });
      await untilAborted(o);
    },
    async (o) => {
      await waitFor(() => nonces.length === 2);
      reply(o, nonces[1], 5);
    },
  );
  engine.getHistory = (() => {
    if (++reloads > 1)
      return Promise.resolve({ id: "c", title: "", messages: [] });
    return new Promise((resolve) => {
      answerHistory = (messages) =>
        resolve({ id: "c", title: "", messages } as never);
    });
  }) as typeof engine.getHistory;

  observeConversation(engine, "Houston/Bo", key, output, 1, registry, fast);
  await waitFor(() => reloads === 1);
  const turn = streamTurn(engine, "Houston/Bo", key, "hi", output, registry, {
    tuning: fast,
  });
  await waitFor(
    () => registry.get(streamKey("Houston/Bo", key))?.kind === "turn",
  );
  answerHistory([
    { role: "user", content: "earlier", turnId: "t-prev" },
    { role: "assistant", content: "Earlier reply", turnId: "t-prev" },
  ]);
  await new Promise((r) => setTimeout(r, 50));
  expect(nonces).toHaveLength(1);
  expect(snapshot(key).sessionStatus).toBe("running");
  await turn;

  expect(snapshot(key).sessionStatus).toBe("completed");
});

test("a pre-settled poll still out at teardown never polls again", async () => {
  const { output } = vmOutput();
  const key = "activity-poll-teardown";
  let reloads = 0;
  let answerHistory: () => void = () => {};
  const { engine } = busyEngine(0, untilAborted);
  engine.getHistory = (() => {
    reloads++;
    return new Promise((resolve) => {
      answerHistory = () => resolve({ id: "c", title: "", messages: [] });
    });
  }) as typeof engine.getHistory;

  const turn = streamTurn(engine, "Houston/Bo", key, "hi", output, registry, {
    tuning: { ...fast, presettledPollMs: 10 },
  });
  await waitFor(() => reloads === 1);
  registry.disposeAll();
  await turn;
  answerHistory();
  await new Promise((r) => setTimeout(r, 100));

  expect(reloads).toBe(1);
});

test("a handoff Stop silences the observer before its rejection unwinds", async () => {
  const { output, snapshot } = vmOutput();
  const key = "activity-handoff-stop-observer";
  let observerEmit: ((f: WireFrame) => void) | undefined;
  const { engine } = busyEngine(0, async (o) => {
    o.onEvent({
      type: "sync",
      data: { running: true, partial: "", turnId: "t-prev", seq: 3 },
      seq: 3,
    });
    observerEmit = o.onEvent;
    await untilAborted(o);
  });
  let posted = false;
  engine.sendMessage = ((
    _id: string,
    _text: string,
    o?: { signal?: AbortSignal },
  ) => {
    posted = true;
    return new Promise((_resolve, reject) => {
      o?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("aborted", "AbortError")),
        { once: true },
      );
    });
  }) as typeof engine.sendMessage;

  observeConversation(engine, "Houston/Bo", key, output, 1, registry, fast);
  await waitFor(() => observerEmit !== undefined);
  const turn = streamTurn(engine, "Houston/Bo", key, "hi", output, registry, {
    tuning: fast,
  });
  await waitFor(() => posted);
  const finish = registry.stopUnsent(streamKey("Houston/Bo", key));
  observerEmit?.({ type: "done", data: null, turnId: "t-prev", seq: 4 });
  await new Promise((r) => setTimeout(r, 50));
  expect(snapshot(key).running).toBe(true);
  finish?.();
  await turn;

  expect(snapshot(key).feed.some((f) => f.data === STOPPED_BY_USER)).toBe(true);
});

test("a teardown silences a history reload the turn still has out", async () => {
  const { output, snapshot } = vmOutput();
  const key = "activity-teardown-reload";
  const persisted: string[] = [];
  output.persistBoardStatus = async (_agent, _session, status) => {
    persisted.push(status);
  };
  let reloading = false;
  let answerHistory: (messages: unknown[]) => void = () => {};
  const { engine, nonces } = busyEngine(
    1,
    async (o) => {
      o.onEvent(sync(false, 0));
      await waitFor(() => nonces.length === 2);
      o.onEvent({
        type: "user",
        data: { content: "hi", ts: 1, nonce: nonces[1] },
        turnId: "t-mine",
        seq: 1,
      });
      throw new Error("Load failed");
    },
    async (o) => {
      o.onEvent({
        type: "sync",
        data: { running: false, partial: "", resync: true, seq: 2 },
        seq: 2,
      });
      await untilAborted(o);
    },
  );
  const send = engine.sendMessage.bind(engine);
  engine.sendMessage = (async (
    id: string,
    text: string,
    o?: { nonce?: string; signal?: AbortSignal },
  ) => {
    if (nonces.length === 0) return send(id, text, o);
    await send(id, text, o);
    return new Promise<never>((_resolve, reject) => {
      o?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException("aborted", "AbortError")),
        { once: true },
      );
    });
  }) as typeof engine.sendMessage;
  engine.getHistory = (() => {
    reloading = true;
    return new Promise((resolve) => {
      answerHistory = (messages) =>
        resolve({ id: "c", title: "", messages } as never);
    });
  }) as typeof engine.getHistory;

  const turn = streamTurn(engine, "Houston/Bo", key, "hi", output, registry, {
    tuning: fast,
  });
  await waitFor(() => reloading);
  const persistedBefore = persisted.length;
  registry.disposeAll();
  answerHistory([
    { role: "user", content: "hi", turnId: "t-mine" },
    { role: "assistant", content: "Done", turnId: "t-mine" },
  ]);
  await turn;
  await new Promise((r) => setTimeout(r, 50));

  expect(snapshot(key).sessionStatus).not.toBe("completed");
  expect(persisted.slice(persistedBefore)).toEqual([]);
});

test("two Stops settle the waiting send only once both cancels answered", async () => {
  const { output, snapshot } = vmOutput();
  const key = "activity-busy-double-stop";
  const { engine } = busyEngine(Number.POSITIVE_INFINITY, async (o) => {
    o.onEvent(sync(false, 0));
    await untilAborted(o);
  });

  const turn = streamTurn(engine, "Houston/Bo", key, "hi", output, registry, {
    tuning: { ...fast, sendBusyNoticeMs: 0 },
  });
  await waitFor(() => snapshot(key)?.sendWaiting === "busy");
  const first = registry.stopUnsent(streamKey("Houston/Bo", key));
  const second = registry.stopUnsent(streamKey("Houston/Bo", key));
  expect(second).not.toBeNull();
  first?.();
  await new Promise((r) => setTimeout(r, 50));
  expect(snapshot(key).boardStatus).not.toBe("needs_you");
  expect(registry.get(streamKey("Houston/Bo", key))?.held).toBe(true);
  second?.();
  await turn;

  expect(snapshot(key).boardStatus).toBe("needs_you");
});

test("a busy takeover runs the conversation again after the observer settled", async () => {
  const { output, snapshot } = vmOutput();
  const key = "activity-busy-takeover-running";
  let observerEmit: ((f: WireFrame) => void) | undefined;
  const { engine, nonces } = busyEngine(
    1,
    async (o) => {
      o.onEvent({
        type: "sync",
        data: { running: true, partial: "", turnId: "t-prev", seq: 3 },
        seq: 3,
      });
      observerEmit = o.onEvent;
      await untilAborted(o);
    },
    async (o) => {
      await waitFor(() => nonces.length === 2);
      reply(o, nonces[1], 5);
    },
  );
  const send = engine.sendMessage.bind(engine);
  engine.sendMessage = (async (...args: Parameters<typeof send>) => {
    if (nonces.length === 0) {
      observerEmit?.({ type: "done", data: null, turnId: "t-prev", seq: 4 });
      await new Promise((r) => setTimeout(r, 20));
    }
    return send(...args);
  }) as typeof engine.sendMessage;

  observeConversation(engine, "Houston/Bo", key, output, 1, registry, fast);
  await waitFor(() => observerEmit !== undefined);
  const turn = streamTurn(engine, "Houston/Bo", key, "hi", output, registry, {
    tuning: fast,
  });
  await waitFor(
    () => registry.get(streamKey("Houston/Bo", key))?.kind === "turn",
  );
  expect(nonces).toHaveLength(1);
  expect(snapshot(key).running).toBe(true);
  await turn;

  expect(snapshot(key).sessionStatus).toBe("completed");
});

test("the last cancel's answer settles the stopped send in the same tick", async () => {
  const { output, snapshot } = vmOutput();
  const key = "activity-busy-stop-same-tick-settle";
  const { engine } = busyEngine(Number.POSITIVE_INFINITY, async (o) => {
    o.onEvent(sync(false, 0));
    await untilAborted(o);
  });

  const turn = streamTurn(engine, "Houston/Bo", key, "hi", output, registry, {
    tuning: { ...fast, sendBusyNoticeMs: 0 },
  });
  await waitFor(() => snapshot(key)?.sendWaiting === "busy");
  const finish = registry.stopUnsent(streamKey("Houston/Bo", key));
  await new Promise((r) => setTimeout(r, 20));
  finish?.();
  expect(snapshot(key).running).toBe(false);
  expect(registry.stopUnsent(streamKey("Houston/Bo", key))).toBeNull();
  await turn;
});

test("a Stop between the last answer and the settle still joins the wait", () => {
  const stop = new PersonStop();
  const first = stop.join();
  first?.();
  const second = stop.join();
  expect(second).not.toBeNull();
  let settled = false;
  void stop.settleWith(() => {
    settled = true;
  });
  expect(settled).toBe(false);
  second?.();
  expect(settled).toBe(true);
  expect(stop.join()).toBeNull();
});

test("a send while another still hands off on the key, its observer gone, fails fast", async () => {
  const { output, snapshot } = vmOutput();
  const key = "activity-send-lock-no-observer";
  const { engine, nonces } = busyEngine(0, untilAborted);
  expect(registry.beginSend(streamKey("Houston/Bo", key))).toBe(true);

  await streamTurn(engine, "Houston/Bo", key, "hi", output, registry, {
    tuning: fast,
  });

  expect(nonces).toHaveLength(0);
  expect(
    snapshot(key).feed.some((f) => f.data === SEND_IN_FLIGHT_MESSAGE),
  ).toBe(true);
  registry.endSend(streamKey("Houston/Bo", key));
});

test("the busy line goes once the re-send's own echo beats its 202", async () => {
  const { output, snapshot } = vmOutput();
  const key = "activity-busy-echo-first";
  let echoed = false;
  let clearedBeforeAnswer = false;
  const { engine, nonces } = busyEngine(1, async (o) => {
    o.onEvent(sync(false, 0));
    await waitFor(() => nonces.length === 2);
    o.onEvent({
      type: "user",
      data: { content: "hi", ts: 1, nonce: nonces[1] },
      turnId: "t-mine",
      seq: 1,
    });
    echoed = true;
    await waitFor(() => answered);
    o.onEvent({ type: "text", data: "Done", turnId: "t-mine", seq: 2 });
    o.onEvent({ type: "done", data: null, turnId: "t-mine", seq: 3 });
  });
  let answered = false;
  const send = engine.sendMessage.bind(engine);
  engine.sendMessage = (async (...args: Parameters<typeof send>) => {
    const answer = await send(...args);
    if (nonces.length === 2) {
      await waitFor(() => echoed);
      clearedBeforeAnswer = snapshot(key).sendWaiting === undefined;
      answered = true;
    }
    return answer;
  }) as typeof engine.sendMessage;

  await streamTurn(engine, "Houston/Bo", key, "hi", output, registry, {
    tuning: { ...fast, sendBusyNoticeMs: 0 },
  });

  expect(clearedBeforeAnswer).toBe(true);
  expect(snapshot(key).sessionStatus).toBe("completed");
});
