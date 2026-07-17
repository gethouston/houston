import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldDropComposerSend } from "../src/submit-gate.ts";

test("drops a repeat submit while the create is still in flight", () => {
  assert.equal(
    shouldDropComposerSend({ activeSessionKey: null, sendInFlight: true }),
    true,
  );
});

test("first submit of a new conversation goes through", () => {
  assert.equal(
    shouldDropComposerSend({ activeSessionKey: null, sendInFlight: false }),
    false,
  );
});

test("follow-ups into an existing session are never dropped", () => {
  assert.equal(
    shouldDropComposerSend({
      activeSessionKey: "activity-1",
      sendInFlight: true,
    }),
    false,
  );
  assert.equal(
    shouldDropComposerSend({
      activeSessionKey: "activity-1",
      sendInFlight: false,
    }),
    false,
  );
});
