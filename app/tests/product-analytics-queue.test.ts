import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import type { ProductAnalyticsLoss } from "../src/lib/product-analytics/queue.ts";
import { ProductAnalyticsQueue } from "../src/lib/product-analytics/queue.ts";
import type {
  ProductAnalyticsEvent,
  ProductAnalyticsSendResult,
} from "../src/lib/product-analytics/wire.ts";

const T0 = "2026-09-12T10:00:00.000Z";

function harness() {
  let now = Date.parse(T0);
  let seq = 0;
  let result: ProductAnalyticsSendResult = { status: "ok" };
  let throwing = false;
  let stalled = false;
  let answerStalled: ((result: ProductAnalyticsSendResult) => void) | null =
    null;
  const sent: ProductAnalyticsEvent[][] = [];
  const lost: Array<{ reason: ProductAnalyticsLoss; detail: unknown }> = [];
  const timers: Array<{ run: () => void; ms: number }> = [];

  const queue = new ProductAnalyticsQueue({
    transport: (events) => {
      sent.push([...events]);
      if (throwing) throw new Error("offline");
      if (stalled) {
        return new Promise<ProductAnalyticsSendResult>((resolve) => {
          answerStalled = resolve;
        });
      }
      return Promise.resolve(result);
    },
    onLost: (reason, detail) => {
      lost.push({ reason, detail });
    },
    now: () => now,
    uuid: () => `id-${++seq}`,
    schedule: (run, ms) => {
      const entry = { run, ms };
      timers.push(entry);
      return () => {
        const at = timers.indexOf(entry);
        if (at >= 0) timers.splice(at, 1);
      };
    },
  });

  /** Let every pending microtask (an in-flight flush) settle. */
  const settle = () => new Promise<void>((done) => setImmediate(done));

  return {
    queue,
    sent,
    lost,
    timers,
    settle,
    tick: (ms: number) => {
      now += ms;
    },
    setResult: (next: ProductAnalyticsSendResult) => {
      result = next;
    },
    setThrowing: (next: boolean) => {
      throwing = next;
    },
    setStalled: (next: boolean) => {
      stalled = next;
    },
    /** Answer the attempt that is still in flight, then let the queue react. */
    answer: async (next: ProductAnalyticsSendResult) => {
      answerStalled?.(next);
      answerStalled = null;
      await settle();
      await settle();
    },
    runTimers: async () => {
      for (const timer of timers.splice(0, timers.length)) timer.run();
      await settle();
    },
  };
}

describe("ProductAnalyticsQueue", () => {
  it("buffers catalogue events only, with their own properties", async () => {
    const h = harness();
    h.queue.enqueue("agent_created", { source: "dialog", agent_id: "opaque" });
    h.queue.enqueue("chat_message_sent", { agent_slug: "opaque" });
    h.queue.enqueue("not_an_event");
    strictEqual(h.queue.size, 1);
    await h.runTimers();
    deepStrictEqual(h.sent, [
      [
        {
          id: "id-1",
          name: "agent_created",
          ts: T0,
          properties: { source: "dialog" },
        },
      ],
    ]);
  });

  it("stamps each event with the moment it happened", async () => {
    const h = harness();
    h.queue.enqueue("command_palette_opened");
    h.tick(1_500);
    h.queue.enqueue("command_palette_opened");
    await h.runTimers();
    deepStrictEqual(
      h.sent[0]?.map((e) => e.ts),
      [T0, "2026-09-12T10:00:01.500Z"],
    );
  });

  it("debounces for three seconds before shipping", async () => {
    const h = harness();
    h.queue.enqueue("tab_opened", { tab_name: "board" });
    strictEqual(h.sent.length, 0);
    strictEqual(h.timers.length, 1);
    strictEqual(h.timers[0]?.ms, 3_000);
    await h.runTimers();
    strictEqual(h.sent.length, 1);
    strictEqual(h.queue.size, 0);
  });

  it("ships a burst of 25 without waiting out the debounce", async () => {
    const h = harness();
    for (let i = 0; i < 25; i += 1) h.queue.enqueue("skill_used");
    await h.settle();
    strictEqual(h.sent.length, 1);
    strictEqual(h.sent[0]?.length, 25);
    strictEqual(h.timers.length, 0);
  });

  it("holds a batch with no session, spending no retry on it", async () => {
    const h = harness();
    h.setResult({ status: "no-session" });
    h.queue.enqueue("session_started");
    await h.runTimers();
    strictEqual(h.sent.length, 1);
    strictEqual(h.queue.size, 1, "signed out is not a delivery failure");

    // Two more held attempts must not exhaust the (untouched) retry budget.
    await h.queue.flush();
    await h.queue.flush();
    h.setResult({ status: "ok" });
    await h.queue.flush();
    strictEqual(h.queue.size, 0);
    strictEqual(h.sent.at(-1)?.[0]?.id, "id-1");
  });

  it("re-polls a held batch on a widening delay", async () => {
    const h = harness();
    h.setResult({ status: "no-session" });
    h.queue.enqueue("session_started");
    await h.runTimers();
    // Nobody else will wake this batch: the sink only re-flushes on a token
    // change, and a session can arrive without one (a refresh mid-attempt).
    strictEqual(h.timers.length, 1, "a held batch re-polls on its own");
    strictEqual(h.timers[0]?.ms, 3_000);
    await h.runTimers();
    strictEqual(h.sent.length, 2);
    strictEqual(h.timers[0]?.ms, 6_000, "each held attempt waits longer");
    for (let i = 0; i < 8; i += 1) await h.runTimers();
    ok(
      (h.timers[0]?.ms ?? 0) <= 60_000,
      "the backoff is bounded, never unbounded",
    );
    h.setResult({ status: "ok" });
    await h.runTimers();
    strictEqual(h.queue.size, 0, "the held batch ships once a session exists");
  });

  it("delivers a batch whose session arrived mid-attempt", async () => {
    const h = harness();
    h.setStalled(true);
    h.queue.enqueue("session_started");
    await h.runTimers();
    strictEqual(h.sent.length, 1, "the first attempt is in flight");

    // The bearer lands while that attempt is still open: the sink flushes, and
    // the batch that is about to come back must not wait for another token.
    await h.queue.flush();
    strictEqual(h.sent.length, 1, "no second batch overlaps the first");
    h.setStalled(false);
    h.setResult({ status: "ok" });
    await h.answer({ status: "no-session" });
    strictEqual(h.sent.length, 2, "the arrival is honoured, not stranded");
    strictEqual(h.queue.size, 0);
  });

  it("spends no attempt per event while a batch is held", async () => {
    const h = harness();
    h.setResult({ status: "no-session" });
    h.queue.enqueue("session_started");
    await h.runTimers();
    strictEqual(h.sent.length, 1);
    // Each attempt costs a bearer refresh, so a growing held backlog must not
    // buy one per event.
    for (let i = 0; i < 60; i += 1) h.queue.enqueue("command_palette_opened");
    await h.settle();
    strictEqual(h.sent.length, 1, "the backlog waits for the re-poll");
  });

  it("re-queues a failed batch once, then drops it", async () => {
    const h = harness();
    h.setResult({ status: "failed" });
    h.queue.enqueue("dictation_used");
    await h.runTimers();
    strictEqual(h.queue.size, 1);
    strictEqual(h.timers.length, 1, "the retry is scheduled, not abandoned");
    await h.runTimers();
    strictEqual(h.sent.length, 2);
    strictEqual(h.queue.size, 0);
    strictEqual(h.timers.length, 0);
  });

  it("treats a throwing transport as a failure, and reports it", async () => {
    const h = harness();
    h.setThrowing(true);
    h.queue.enqueue("search_performed", { surface: "missions" });
    await h.runTimers();
    strictEqual(h.queue.size, 1);
    // The transport answers with a result for every expected outcome, offline
    // included, so a throw is a bug — it must reach the reporting path.
    strictEqual(h.lost[0]?.reason, "unexpected");
    h.setThrowing(false);
    await h.runTimers();
    strictEqual(h.queue.size, 0);
    strictEqual(h.sent.length, 2);
  });

  it("drops the newest events once the backlog is capped", async () => {
    const h = harness();
    h.setResult({ status: "no-session" });
    for (let i = 0; i < 250; i += 1) h.queue.enqueue("command_palette_opened");
    await h.settle();
    strictEqual(h.queue.size, 200);
    const overflow = h.lost.filter((loss) => loss.reason === "overflow");
    ok(overflow.length > 0, "a cap that throws events away must be reported");

    h.setResult({ status: "ok" });
    await h.queue.flush();
    // The route refuses a batch above 100, so the backlog ships in slices —
    // oldest first. The launch beats a held batch is holding are exactly what
    // the funnel is read from, so the cap throws away the NEWEST instead.
    strictEqual(h.sent.at(-1)?.length, 100);
    strictEqual(h.sent.at(-1)?.[0]?.id, "id-1");
    strictEqual(h.queue.size, 100);
  });

  it("reports the ids the gateway rejected and never resends them", async () => {
    const h = harness();
    h.setResult({
      status: "ok",
      rejected: [{ id: "id-1", reason: "invalid_timestamp" }],
    });
    h.queue.enqueue("file_attached", { file_kind: "pdf" });
    await h.runTimers();
    strictEqual(h.queue.size, 0);
    strictEqual(h.sent.length, 1);
    deepStrictEqual(
      h.lost,
      [
        {
          reason: "rejected",
          detail: [{ id: "id-1", reason: "invalid_timestamp" }],
        },
      ],
      "a rejected event must not vanish silently",
    );
  });

  it("forgets everything when there is nowhere to ship to", async () => {
    const h = harness();
    h.queue.enqueue("agent_shared", { source: "settings" });
    h.queue.clear();
    strictEqual(h.queue.size, 0);
    strictEqual(h.timers.length, 0);
    await h.settle();
    strictEqual(h.sent.length, 0);
  });

  it("never overlaps two in-flight batches", async () => {
    const h = harness();
    h.setStalled(true);
    for (let i = 0; i < 25; i += 1) h.queue.enqueue("skill_installed");
    await h.settle();
    strictEqual(h.sent.length, 1);
    await h.queue.flush();
    strictEqual(h.sent.length, 1, "the first batch is still in flight");
  });
});
