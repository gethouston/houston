import test from "node:test";
import assert from "node:assert/strict";
import { mergeFeedItem, mergeFeedHistory } from "../src/feed-merge.ts";

const user = (text) => ({ feed_type: "user_message", data: text });
const assistant = (text) => ({ feed_type: "assistant_text", data: text });
const stream = (text) => ({ feed_type: "assistant_text_streaming", data: text });
const finalResult = (text) => ({
  feed_type: "final_result",
  data: { result: text, cost_usd: null, duration_ms: null },
});

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

test("mergeFeedItem drops a duplicate final assistant after final_result", () => {
  const items = [user("ping?"), assistant("Pong."), finalResult("Pong.")];

  // A live WS event re-delivering the same assistant text must not append a
  // second copy below the final_result marker.
  assert.equal(mergeFeedItem(items, assistant("Pong.")), items);
});

test("mergeFeedItem drops a stale stream equivalent to a settled final", () => {
  const items = [user("ping?"), assistant("Pong.")];

  // A late streaming chunk whose text already settled as a final must not
  // re-open the turn.
  assert.equal(mergeFeedItem(items, stream("Pong.")), items);
});

test("mergeFeedHistory keeps a single turn when history equals the live feed", () => {
  // The common surfaced-routine case: the run completed, its transcript is
  // both persisted (history) and already in the live store (WS during run).
  const history = [user("ping?"), assistant("Pong."), finalResult("Pong.")];
  const current = [user("ping?"), assistant("Pong."), finalResult("Pong.")];

  assert.deepEqual(mergeFeedHistory(history, current), history);
});

test("mergeFeedHistory drops a stale stream when history has the final answer", () => {
  // Issue #363: a surfaced routine whose live store still holds the streaming
  // chunk while the DB history holds the settled final. Naive JSON dedup left
  // both, rendering the first user message + AI response twice.
  const history = [user("ping?"), assistant("Pong."), finalResult("Pong.")];
  const current = [user("ping?"), stream("Pong.")];

  assert.deepEqual(mergeFeedHistory(history, current), history);
});

test("mergeFeedHistory keeps live tail items not yet persisted", () => {
  const history = [user("ping?"), assistant("Pong."), finalResult("Pong.")];
  const current = [
    user("ping?"),
    assistant("Pong."),
    finalResult("Pong."),
    user("now say it shorter"),
    stream("Po"),
  ];

  assert.deepEqual(mergeFeedHistory(history, current), [
    ...history,
    user("now say it shorter"),
    stream("Po"),
  ]);
});

test("mergeFeedHistory preserves a legitimately repeated user turn", () => {
  // Count-based consumption, not set membership: a user genuinely repeating
  // the same text must survive the merge.
  const history = [user("hi"), assistant("hello"), user("hi")];
  const current = [user("hi"), assistant("hello"), user("hi")];

  assert.deepEqual(mergeFeedHistory(history, current), history);
});
