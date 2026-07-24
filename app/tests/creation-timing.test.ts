import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  CREATION_GIVE_UP_MS,
  CreationStopwatch,
  type CreationTimingDeps,
  hasAgentOutput,
  isAgentOutputItem,
} from "../src/lib/creation-timing.ts";

type Feed = Array<{ feed_type: string }>;

/** Manual-clock deps: advance time with tick(), drive the feed with push(). */
function harness(opts: { remote?: boolean } = {}) {
  let now = 0;
  const emitted: Array<Record<string, unknown>> = [];
  const timers: Array<{ fn: () => void; at: number; cleared: boolean }> = [];
  let feedCb: ((feed: Feed) => void) | null = null;
  let currentFeed: Feed = [];
  let unwatched = 0;
  const deps: CreationTimingDeps = {
    now: () => now,
    emit: (p) => emitted.push(p),
    log: () => {},
    watchFeed: (_path, _key, cb) => {
      feedCb = cb;
      cb(currentFeed);
      return () => {
        unwatched += 1;
      };
    },
    remoteEngine: () => opts.remote ?? true,
    setTimer: (fn, ms) => {
      const timer = { fn, at: now + ms, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (t) => {
      (t as { cleared: boolean }).cleared = true;
    },
  };
  return {
    watch: new CreationStopwatch(deps),
    emitted,
    tick: (ms: number) => {
      now += ms;
      for (const t of timers) {
        if (!t.cleared && t.at <= now) {
          t.cleared = true;
          t.fn();
        }
      }
    },
    push: (feed: Feed) => {
      currentFeed = feed;
      feedCb?.(feed);
    },
    unwatchedCount: () => unwatched,
  };
}

describe("agent output detection", () => {
  it("counts assistant text, thinking, and tool calls as output", () => {
    for (const feed_type of [
      "assistant_text",
      "assistant_text_streaming",
      "thinking",
      "thinking_streaming",
      "tool_call",
    ]) {
      strictEqual(isAgentOutputItem({ feed_type }), true, feed_type);
    }
  });
  it("ignores user messages and system items", () => {
    strictEqual(
      hasAgentOutput([
        { feed_type: "user_message" },
        { feed_type: "system_message" },
      ]),
      false,
    );
  });
});

describe("CreationStopwatch", () => {
  it("emits the full breakdown when the first reply lands", () => {
    const h = harness();
    h.watch.begin();
    h.tick(800);
    h.watch.markCreated("agent-1");
    h.tick(50);
    h.watch.markRevealed();
    h.watch.bindConversation("/w/a", "activity-x");
    h.tick(9_000);
    h.watch.markEngineReady("agent-1");
    h.tick(400);
    h.watch.markIntroDispatched("activity-x");
    h.tick(3_000);
    h.push([{ feed_type: "user_message" }, { feed_type: "assistant_text" }]);
    deepStrictEqual(h.emitted, [
      {
        outcome: "replied",
        remote_engine: true,
        create_request_ms: 800,
        reveal_ms: 850,
        warming_ms: 9_050,
        dispatch_ms: 400,
        first_reply_ms: 3_000,
        total_ms: 13_250,
      },
    ]);
    strictEqual(h.unwatchedCount(), 1);
  });

  it("finishes immediately when the bound feed already has output", () => {
    const h = harness();
    h.watch.begin();
    h.watch.markCreated("agent-1");
    h.push([{ feed_type: "assistant_text" }]);
    h.watch.bindConversation("/w/a", "activity-x");
    strictEqual(h.emitted.length, 1);
    strictEqual(h.emitted[0]?.outcome, "replied");
  });

  it("ignores marks for other agents and conversations", () => {
    const h = harness();
    h.watch.begin();
    h.watch.markCreated("agent-1");
    h.watch.bindConversation("/w/a", "activity-x");
    h.watch.markEngineReady("someone-else");
    h.watch.markIntroDispatched("activity-other");
    h.tick(100);
    h.push([{ feed_type: "assistant_text" }]);
    strictEqual(h.emitted[0]?.warming_ms, null);
    strictEqual(h.emitted[0]?.dispatch_ms, null);
  });

  it("a failed create emits a partial breakdown", () => {
    const h = harness();
    h.watch.begin();
    h.tick(1_200);
    h.watch.fail();
    strictEqual(h.emitted.length, 1);
    strictEqual(h.emitted[0]?.outcome, "failed");
    strictEqual(h.emitted[0]?.create_request_ms, null);
    strictEqual(h.emitted[0]?.total_ms, 1_200);
    // No record left: later marks are no-ops, nothing further emits.
    h.watch.markCreated("agent-1");
    strictEqual(h.emitted.length, 1);
  });

  it("a second begin supersedes the first watch", () => {
    const h = harness();
    h.watch.begin();
    h.watch.markCreated("agent-1");
    h.tick(500);
    h.watch.begin();
    strictEqual(h.emitted.length, 1);
    strictEqual(h.emitted[0]?.outcome, "superseded");
  });

  it("gives up after the watch window and reports no first reply", () => {
    const h = harness();
    h.watch.begin();
    h.watch.markCreated("agent-1");
    h.watch.bindConversation("/w/a", "activity-x");
    h.tick(CREATION_GIVE_UP_MS);
    strictEqual(h.emitted.length, 1);
    strictEqual(h.emitted[0]?.outcome, "gave_up");
    strictEqual(h.emitted[0]?.first_reply_ms, null);
    strictEqual(h.unwatchedCount(), 1);
    // The watch is over: a late reply must not double-emit.
    h.push([{ feed_type: "assistant_text" }]);
    strictEqual(h.emitted.length, 1);
  });

  it("local profile: no warming mark, dispatch measured from create", () => {
    const h = harness({ remote: false });
    h.watch.begin();
    h.tick(300);
    h.watch.markCreated("agent-1");
    h.watch.bindConversation("/w/a", "activity-x");
    h.tick(200);
    h.watch.markIntroDispatched("activity-x");
    h.tick(1_000);
    h.push([{ feed_type: "thinking_streaming" }]);
    deepStrictEqual(h.emitted, [
      {
        outcome: "replied",
        remote_engine: false,
        create_request_ms: 300,
        reveal_ms: null,
        warming_ms: null,
        dispatch_ms: 200,
        first_reply_ms: 1_000,
        total_ms: 1_500,
      },
    ]);
  });
});
