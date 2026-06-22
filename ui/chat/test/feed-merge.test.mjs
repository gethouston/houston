import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeFeedItem,
  mergeFeedHistory,
  reconcileUserMessageEcho,
} from "../src/feed-merge.ts";

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

// ── reconcileUserMessageEcho: optimistic↔echo dedup (issues #363 + #381) ───

test("echo of an optimistic push is dropped (issue #363)", () => {
  const pending = {};
  // The local client pushed the prompt optimistically first.
  assert.equal(
    reconcileUserMessageEcho(
      pending,
      { feed_type: "user_message", data: "ping" },
      false,
    ),
    true,
  );
  assert.deepEqual(pending, { ping: 1 });
  // The engine's WS echo of that same prompt is the duplicate — drop it.
  assert.equal(
    reconcileUserMessageEcho(
      pending,
      { feed_type: "user_message", data: "ping" },
      true,
    ),
    false,
  );
  assert.deepEqual(pending, { ping: 0 });
});

test("an echo with no pending optimistic push appends (routine run / cross-client)", () => {
  // A background routine run never pushes optimistically, so its prompt arrives
  // only as a WS echo and must append.
  const pending = {};
  assert.equal(
    reconcileUserMessageEcho(
      pending,
      { feed_type: "user_message", data: "check email" },
      true,
    ),
    true,
  );
  assert.deepEqual(pending, {});
});

test("repeated routine runs with the identical prompt all append (issue #381)", () => {
  // One chat per routine: every run carries the same prompt and arrives as a WS
  // echo with nothing pending. Each must append — no run's prompt is swallowed.
  const pending = {};
  for (let i = 0; i < 3; i += 1) {
    assert.equal(
      reconcileUserMessageEcho(
        pending,
        { feed_type: "user_message", data: "check email" },
        true,
      ),
      true,
      `run ${i} appends`,
    );
  }
});

test("deliberate local repeat keeps both; both echoes drop", () => {
  const pending = {};
  reconcileUserMessageEcho(
    pending,
    { feed_type: "user_message", data: "again" },
    false,
  );
  reconcileUserMessageEcho(
    pending,
    { feed_type: "user_message", data: "again" },
    false,
  );
  assert.deepEqual(pending, { again: 2 });
  assert.equal(
    reconcileUserMessageEcho(
      pending,
      { feed_type: "user_message", data: "again" },
      true,
    ),
    false,
  );
  assert.equal(
    reconcileUserMessageEcho(
      pending,
      { feed_type: "user_message", data: "again" },
      true,
    ),
    false,
  );
  assert.deepEqual(pending, { again: 0 });
});

test("non-user_message items are never gated by the echo tally", () => {
  const pending = {};
  assert.equal(
    reconcileUserMessageEcho(
      pending,
      { feed_type: "assistant_text", data: "hi" },
      true,
    ),
    true,
  );
  assert.deepEqual(pending, {});
});

// ── mergeFeedItem: streaming/tool merges leave user_messages alone ──────────

test("mergeFeedItem appends user_messages verbatim (dedup moved out)", () => {
  const feed = [{ feed_type: "user_message", data: "ping" }];
  const merged = mergeFeedItem(feed, {
    feed_type: "user_message",
    data: "ping",
  });
  assert.deepEqual(merged, [
    { feed_type: "user_message", data: "ping" },
    { feed_type: "user_message", data: "ping" },
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
    {
      feed_type: "final_result",
      data: { result: "done", cost_usd: null, duration_ms: null },
    },
  ];
  const current = [
    { feed_type: "user_message", data: "run the report" },
    { feed_type: "assistant_text", data: "done" },
    {
      feed_type: "final_result",
      data: { result: "done", cost_usd: null, duration_ms: null },
    },
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
