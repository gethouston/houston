import assert from "node:assert/strict";
import test from "node:test";
import {
  parsePushPayload,
  pushPayloadOrReport,
} from "../src/lib/push-payload.ts";

const valid = {
  v: "1",
  type: "turn_settled",
  org: "o",
  agent: "a",
  conversation: "activity-m",
  mission: "m",
  reason: "finished",
  event: "e",
};
test("C23 push payload accepts version 1 navigation data", () => {
  assert.deepEqual(parsePushPayload(valid), valid);
});
test("C23 push payload rejects unknown versions and missing targets", () => {
  assert.equal(parsePushPayload({ ...valid, v: "2" }), null);
  assert.equal(parsePushPayload({ ...valid, conversation: "" }), null);
  const reported: Error[] = [];
  assert.equal(
    pushPayloadOrReport({ ...valid, v: "2" }, (error) => reported.push(error)),
    null,
  );
  assert.match(reported[0].message, /Unknown push notification payload/);
});
