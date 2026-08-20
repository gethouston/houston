import { expect, test } from "vitest";
import {
  assertRoutineEventBounds,
  MAX_EVENT_PAYLOAD_CHARS,
  MAX_ROUTINE_EVENTS,
} from "./parse-routine-events";

const event = (payload: unknown) => ({
  id: "e1",
  trigger_slug: "GMAIL_NEW_GMAIL_MESSAGE",
  payload,
});

test("ordinary event batches pass", () => {
  expect(() =>
    assertRoutineEventBounds([event({ subject: "hi" }), event(null)]),
  ).not.toThrow();
});

test("too many events are rejected", () => {
  const events = Array.from({ length: MAX_ROUTINE_EVENTS + 1 }, () =>
    event({}),
  );
  expect(() => assertRoutineEventBounds(events)).toThrow(/exceeds/);
});

test("an oversized payload is rejected", () => {
  const payload = { text: "x".repeat(MAX_EVENT_PAYLOAD_CHARS) };
  expect(() => assertRoutineEventBounds([event(payload)])).toThrow(
    /serialized chars/,
  );
});

test("an absurdly deep payload is rejected (pretty-print inflation guard)", () => {
  let deep: unknown = "leaf";
  for (let i = 0; i < 200; i++) deep = [deep];
  expect(() => assertRoutineEventBounds([event(deep)])).toThrow(/nests deeper/);
});

test("oversized id or trigger_slug is rejected", () => {
  expect(() =>
    assertRoutineEventBounds([
      { id: "x".repeat(300), trigger_slug: "s", payload: {} },
    ]),
  ).toThrow(/too long/);
});
