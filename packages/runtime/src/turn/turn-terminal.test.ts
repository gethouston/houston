import { describe, expect, it, test } from "vitest";
import { turnSyncReport } from "./turn-sync-report";
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
    {
      hydratedObjects: 7,
      skippedObjects: 88,
      startupObjects: 5,
      startupBytes: 4096,
    },
  ) as unknown as { data: Record<string, number> };
  expect(frame.data).toMatchObject({
    hydratedObjects: 7,
    skippedObjects: 88,
    startupObjects: 5,
    startupBytes: 4096,
  });
});

test("the done frame names the board cards a sync-back merge removed", () => {
  const board = "workspaces/W/A/.houston/activity/activity.json";
  const sync = turnSyncReport(
    {
      uploaded: [board],
      conflicts: [],
      skipped: [],
      merges: [{ key: board, attempts: 1, removedCards: ["card-9"] }],
    },
    "workspaces/W/A",
  );
  const frame = turnTerminalFrame(
    {},
    "t1",
    0,
    undefined,
    undefined,
    [],
    undefined,
    undefined,
    { sync },
  ) as unknown as { data: Record<string, unknown> };
  expect(frame.data.syncMerges).toEqual([
    { key: board, attempts: 1, removedCards: ["card-9"] },
  ]);
});

test("the done frame says when a board would not merge and the turn's bytes overwrote it", () => {
  const board = "workspaces/W/A/.houston/activity/activity.json";
  const merge = {
    key: board,
    attempts: 1,
    unmergeable: "Unexpected token '﻿', \"﻿[]\" is not valid JSON",
  };
  const sync = turnSyncReport(
    { uploaded: [board], conflicts: [], skipped: [], merges: [merge] },
    "workspaces/W/A",
  );
  const frame = turnTerminalFrame(
    {},
    "t1",
    0,
    undefined,
    undefined,
    [],
    undefined,
    undefined,
    { sync },
  ) as unknown as { data: Record<string, unknown> };
  expect(frame.data.syncMerges).toEqual([merge]);
  expect(frame.data.syncIncomplete).toBeUndefined();
});

test("the terminal frame carries the model-call report with the worker's pre-prompt span", () => {
  const modelCalls = {
    v: 1 as const,
    turnId: "t1",
    backend: "claude" as const,
    startupMs: { harness_init: 800 },
    calls: [],
    droppedCalls: 0,
  };
  const frame = turnTerminalFrame(
    { error: "boom" },
    "t1",
    0,
    undefined,
    undefined,
    [],
    { t0_request: 1000, t_prompt_start: 1420.2 },
    undefined,
    { modelCalls },
  ) as unknown as { data: { modelCalls: unknown } };
  expect(frame.data.modelCalls).toEqual({
    ...modelCalls,
    startupMs: { harness_init: 800, pre_prompt: 420 },
  });
});
