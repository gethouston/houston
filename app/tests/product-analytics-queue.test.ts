import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { describe, it } from "node:test";
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
  const sent: ProductAnalyticsEvent[][] = [];
  const timers: Array<{ run: () => void; ms: number }> = [];

  const queue = new ProductAnalyticsQueue({
    transport: (events) => {
      sent.push([...events]);
      if (throwing) throw new Error("offline");
      if (stalled) return new Promise<ProductAnalyticsSendResult>(() => {});
      return Promise.resolve(result);
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
    runTimers: async () => {
      for (const timer of timers.splice(0, timers.length)) timer.run();
      await settle();
    },
  };
}

function captureWarnings(): { lines: unknown[][]; restore: () => void } {
  const original = console.warn;
  const lines: unknown[][] = [];
  console.warn = (...args: unknown[]) => {
    lines.push(args);
  };
  return {
    lines,
    restore: () => {
      console.warn = original;
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
    strictEqual(h.timers.length, 0, "only a session arriving can change this");

    // Two more held attempts must not exhaust the (untouched) retry budget.
    await h.queue.flush();
    await h.queue.flush();
    h.setResult({ status: "ok" });
    await h.queue.flush();
    strictEqual(h.queue.size, 0);
    strictEqual(h.sent.at(-1)?.[0]?.id, "id-1");
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

  it("treats a throwing transport as a failure", async () => {
    const h = harness();
    h.setThrowing(true);
    h.queue.enqueue("search_performed", { surface: "missions" });
    await h.runTimers();
    strictEqual(h.queue.size, 1);
    h.setThrowing(false);
    await h.runTimers();
    strictEqual(h.queue.size, 0);
    strictEqual(h.sent.length, 2);
  });

  it("drops the oldest events once the backlog is capped", async () => {
    const h = harness();
    h.setResult({ status: "no-session" });
    for (let i = 0; i < 250; i += 1) h.queue.enqueue("command_palette_opened");
    await h.settle();
    strictEqual(h.queue.size, 200);
    strictEqual(h.queue.dropped, 50);

    h.setResult({ status: "ok" });
    await h.queue.flush();
    // The route refuses a batch above 100, so the backlog ships in slices —
    // oldest first, and the events the cap threw away are the oldest of all.
    strictEqual(h.sent.at(-1)?.length, 100);
    strictEqual(h.sent.at(-1)?.[0]?.id, "id-51");
    strictEqual(h.queue.size, 100);
  });

  it("reports the ids the gateway rejected and never resends them", async () => {
    const h = harness();
    h.setResult({
      status: "ok",
      rejected: [{ id: "id-1", reason: "invalid_timestamp" }],
    });
    h.queue.enqueue("file_attached", { file_kind: "pdf" });
    const warnings = captureWarnings();
    try {
      await h.runTimers();
    } finally {
      warnings.restore();
    }
    strictEqual(h.queue.size, 0);
    strictEqual(h.sent.length, 1);
    ok(
      warnings.lines.some((line) =>
        line.some((arg) => JSON.stringify(arg)?.includes("invalid_timestamp")),
      ),
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
