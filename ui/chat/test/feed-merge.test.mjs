import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeFeedHistory,
  mergeFeedItem,
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

test("echo of an optimistic push is dropped (issue #363)", () => {
  const pending = {};
  assert.equal(
    reconcileUserMessageEcho(
      pending,
      { feed_type: "user_message", data: "ping" },
      false,
    ),
    true,
  );
  assert.deepEqual(pending, { ping: 1 });
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

test("history reconcile: surfaced routine does not duplicate its turn", () => {
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

test("history reconcile: a client-only error stays where it first appeared", () => {
  const history = [
    { feed_type: "user_message", data: "do the thing" },
    { feed_type: "user_message", data: "retry" },
    { feed_type: "assistant_text", data: "done" },
  ];
  const current = [
    { feed_type: "user_message", data: "do the thing" },
    { feed_type: "system_message", data: "Session error: boom" },
    { feed_type: "user_message", data: "retry" },
    { feed_type: "assistant_text", data: "done" },
  ];

  assert.deepEqual(mergeFeedHistory(history, current), [
    { feed_type: "user_message", data: "do the thing" },
    { feed_type: "system_message", data: "Session error: boom" },
    { feed_type: "user_message", data: "retry" },
    { feed_type: "assistant_text", data: "done" },
  ]);
});

test("history reconcile: a trailing client-only error appends after history", () => {
  const history = [{ feed_type: "user_message", data: "do the thing" }];
  const current = [
    { feed_type: "user_message", data: "do the thing" },
    { feed_type: "system_message", data: "Session error: boom" },
  ];

  assert.deepEqual(mergeFeedHistory(history, current), [
    { feed_type: "user_message", data: "do the thing" },
    { feed_type: "system_message", data: "Session error: boom" },
  ]);
});

test("history reconcile: consecutive client-only items keep their order", () => {
  const history = [
    { feed_type: "user_message", data: "go" },
    { feed_type: "assistant_text", data: "ok" },
  ];
  const current = [
    { feed_type: "user_message", data: "go" },
    { feed_type: "system_message", data: "Session error: one" },
    { feed_type: "system_message", data: "Session error: two" },
    { feed_type: "assistant_text", data: "ok" },
  ];

  assert.deepEqual(mergeFeedHistory(history, current), [
    { feed_type: "user_message", data: "go" },
    { feed_type: "system_message", data: "Session error: one" },
    { feed_type: "system_message", data: "Session error: two" },
    { feed_type: "assistant_text", data: "ok" },
  ]);
});

test("history reconcile: a history-only background turn weaves in around a client-only error", () => {
  const history = [
    { feed_type: "user_message", data: "first" },
    { feed_type: "assistant_text", data: "reply" },
    { feed_type: "user_message", data: "second" },
  ];
  const current = [
    { feed_type: "user_message", data: "first" },
    { feed_type: "system_message", data: "Session error: boom" },
    { feed_type: "user_message", data: "second" },
  ];

  assert.deepEqual(mergeFeedHistory(history, current), [
    { feed_type: "user_message", data: "first" },
    { feed_type: "system_message", data: "Session error: boom" },
    { feed_type: "assistant_text", data: "reply" },
    { feed_type: "user_message", data: "second" },
  ]);
});
