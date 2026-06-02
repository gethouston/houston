import test from "node:test";
import assert from "node:assert/strict";
import { mergeFeedItem, mergeFeedHistory } from "../src/feed-merge.ts";

test("assistant final replaces streaming text before queued user message", () => {
  const queued = [
    { feed_type: "user_message", data: "first" },
    { feed_type: "assistant_text_streaming", data: "work" },
    { feed_type: "user_message", data: "second" },
  ];

  const merged = mergeFeedItem(queued, {
    feed_type: "assistant_text",
    data: "work done",
  });

  assert.deepEqual(merged, [
    { feed_type: "user_message", data: "first" },
    { feed_type: "assistant_text", data: "work done" },
    { feed_type: "user_message", data: "second" },
  ]);
});

test("streaming updates replace existing stream before queued user message", () => {
  const queued = [
    { feed_type: "user_message", data: "first" },
    { feed_type: "assistant_text_streaming", data: "w" },
    { feed_type: "user_message", data: "second" },
  ];

  const merged = mergeFeedItem(queued, {
    feed_type: "assistant_text_streaming",
    data: "work",
  });

  assert.deepEqual(merged, [
    { feed_type: "user_message", data: "first" },
    { feed_type: "assistant_text_streaming", data: "work" },
    { feed_type: "user_message", data: "second" },
  ]);
});

// ── mergeFeedItem: WS user_message echo dedup (issue #363) ─────────────────

test("WS user_message echo dropped when it duplicates a non-consecutive turn", () => {
  // The engine re-broadcasts the prompt over the session topic AFTER the
  // assistant has started replying, so the echo lands after the reply — not
  // consecutively. Old code only collapsed consecutive user_messages, so this
  // duplicated the user's first message.
  const feed = [
    { feed_type: "user_message", data: "ping" },
    { feed_type: "assistant_text", data: "pong" },
  ];

  const merged = mergeFeedItem(
    feed,
    { feed_type: "user_message", data: "ping" },
    { fromWs: true },
  );

  assert.deepEqual(merged, feed);
});

test("WS user_message echo dropped when it duplicates the previous turn", () => {
  const feed = [{ feed_type: "user_message", data: "ping" }];
  const merged = mergeFeedItem(
    feed,
    { feed_type: "user_message", data: "ping" },
    { fromWs: true },
  );
  assert.deepEqual(merged, feed);
});

test("local user_message repeat always appends (deliberate repeat preserved)", () => {
  // No fromWs => optimistic/local push. A user sending the same text twice
  // keeps both copies; provenance, not shape, gates the dedup.
  const feed = [
    { feed_type: "user_message", data: "again" },
    { feed_type: "assistant_text", data: "ok" },
  ];

  const merged = mergeFeedItem(feed, { feed_type: "user_message", data: "again" });

  assert.deepEqual(merged, [
    ...feed,
    { feed_type: "user_message", data: "again" },
  ]);
});

test("WS user_message with new text still appends", () => {
  const feed = [{ feed_type: "user_message", data: "ping" }];
  const merged = mergeFeedItem(
    feed,
    { feed_type: "user_message", data: "different" },
    { fromWs: true },
  );
  assert.deepEqual(merged, [
    { feed_type: "user_message", data: "ping" },
    { feed_type: "user_message", data: "different" },
  ]);
});

// ── mergeFeedHistory: hydration reconcile (issue #363) ─────────────────────

test("history reconcile: surfaced routine does not duplicate its turn", () => {
  // A routine ran in the background: the live bucket accumulated the turn over
  // WS, and the same turn is persisted in server history. Opening the activity
  // must not render user + reply twice.
  const history = [
    { feed_type: "user_message", data: "run the report" },
    { feed_type: "assistant_text", data: "done" },
    { feed_type: "final_result", data: { result: "done", cost_usd: null, duration_ms: null } },
  ];
  const current = [
    { feed_type: "user_message", data: "run the report" },
    { feed_type: "assistant_text", data: "done" },
    { feed_type: "final_result", data: { result: "done", cost_usd: null, duration_ms: null } },
  ];

  assert.deepEqual(mergeFeedHistory(history, current), history);
});

test("history reconcile: live streaming form matches persisted final", () => {
  // Server persists the final assistant_text; the live bucket may still hold
  // the streaming variant. They are the same turn and must collapse.
  const history = [
    { feed_type: "user_message", data: "hi" },
    { feed_type: "assistant_text", data: "hello there" },
  ];
  const current = [
    { feed_type: "user_message", data: "hi" },
    { feed_type: "assistant_text_streaming", data: "hello there" },
  ];

  assert.deepEqual(mergeFeedHistory(history, current), history);
});

test("history reconcile: live thinking_streaming matches persisted thinking", () => {
  const history = [
    { feed_type: "thinking", data: "let me consider" },
    { feed_type: "assistant_text", data: "answer" },
  ];
  const current = [
    { feed_type: "thinking_streaming", data: "let me consider" },
    { feed_type: "assistant_text", data: "answer" },
  ];

  assert.deepEqual(mergeFeedHistory(history, current), history);
});

test("history reconcile: genuinely new live tail is appended", () => {
  // The user sent a follow-up after history was snapshotted; it isn't on the
  // server yet, so it must survive the reconcile.
  const history = [
    { feed_type: "user_message", data: "first" },
    { feed_type: "assistant_text", data: "reply" },
  ];
  const current = [
    { feed_type: "user_message", data: "first" },
    { feed_type: "assistant_text", data: "reply" },
    { feed_type: "user_message", data: "follow-up" },
  ];

  assert.deepEqual(mergeFeedHistory(history, current), [
    { feed_type: "user_message", data: "first" },
    { feed_type: "assistant_text", data: "reply" },
    { feed_type: "user_message", data: "follow-up" },
  ]);
});

test("history reconcile: count-based — a legitimate repeat is kept", () => {
  // History has the turn once; the live bucket has it twice (the user really
  // did send it twice). One copy is matched by history; the extra survives.
  const history = [{ feed_type: "user_message", data: "ok" }];
  const current = [
    { feed_type: "user_message", data: "ok" },
    { feed_type: "user_message", data: "ok" },
  ];

  assert.deepEqual(mergeFeedHistory(history, current), [
    { feed_type: "user_message", data: "ok" },
    { feed_type: "user_message", data: "ok" },
  ]);
});

test("history reconcile: empty live bucket returns history unchanged", () => {
  const history = [{ feed_type: "user_message", data: "x" }];
  assert.equal(mergeFeedHistory(history, []), history);
});

test("history reconcile: distinct turns of the same type stay distinct", () => {
  const history = [
    { feed_type: "assistant_text", data: "one" },
    { feed_type: "assistant_text", data: "two" },
  ];
  const current = [{ feed_type: "assistant_text", data: "three" }];

  assert.deepEqual(mergeFeedHistory(history, current), [
    { feed_type: "assistant_text", data: "one" },
    { feed_type: "assistant_text", data: "two" },
    { feed_type: "assistant_text", data: "three" },
  ]);
});
