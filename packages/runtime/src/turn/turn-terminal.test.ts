import { describe, expect, it, test } from "vitest";
import { turnTerminalFrame } from "./turn-terminal";

describe("turnTerminalFrame", () => {
  it("keeps the public done frame (null data) when nothing changed", () => {
    expect(turnTerminalFrame({}, "t1", 0)).toEqual({
      type: "done",
      data: null,
      turnId: "t1",
    });
  });

  it("carries changed on the done frame", () => {
    expect(
      turnTerminalFrame({}, "t1", 0, undefined, undefined, [
        "ActivityChanged",
        "ConversationsChanged",
      ]),
    ).toEqual({
      type: "done",
      data: { changed: ["ActivityChanged", "ConversationsChanged"] },
      turnId: "t1",
    });
  });

  it("carries changed on the error frame beside the message", () => {
    // A provider failure after a durable tool write still changed what other
    // tabs show; the message the SDK reads is untouched.
    expect(
      turnTerminalFrame({ error: "boom" }, "t1", 2, undefined, undefined, [
        "ConversationsChanged",
      ]),
    ).toEqual({
      type: "error",
      data: {
        message: "boom",
        changed: ["ConversationsChanged"],
        poolWritesOutOfScope: 2,
      },
      turnId: "t1",
    });
  });
});

test("the done frame reports phase marks as whole-ms deltas from the earliest", () => {
  const frame = turnTerminalFrame({}, "t1", 0, undefined, undefined, [], {
    t_accept: 1000,
    t_tmpdir: 1010.4,
    t_first_model_event: 2500.9,
  }) as unknown as { data: { timingsMs: Record<string, number> } };
  expect(frame.data.timingsMs).toEqual({
    accept: 0,
    tmpdir: 10,
    first_model_event: 1501,
  });
});

test("no marks means no timings field on the done frame", () => {
  const frame = turnTerminalFrame({}, "t1", 0) as unknown as {
    data: unknown;
  };
  expect(frame.data).toBeNull();
});

test("the done frame reports hydrated and skipped object counts", () => {
  const frame = turnTerminalFrame(
    {},
    "t1",
    0,
    undefined,
    undefined,
    [],
    undefined,
    { hydratedObjects: 7, skippedObjects: 88 },
  ) as unknown as { data: Record<string, number> };
  expect(frame.data).toMatchObject({ hydratedObjects: 7, skippedObjects: 88 });
});
