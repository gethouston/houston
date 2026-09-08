import { deepStrictEqual, strictEqual } from "node:assert/strict";
import { describe, it } from "node:test";
import type { Routine } from "@houston-ai/engine-client";
import {
  applyOptimisticRoutineUpdate,
  patchRoutineList,
  replaceRoutineInList,
} from "../src/lib/routine-optimistic.ts";

/**
 * PRODUCT-1706 — a routine edit paints immediately. These pin that the interim
 * shape matches what the host will apply: the schedule moves at once, a wake
 * mechanism switch never leaves both set, and a null clears a pin.
 */
const NOW = "2026-09-08T13:28:21.755Z";

function routine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: "r1",
    name: "Daily cut",
    prompt: "Cut a release",
    schedule: "30 11 * * 1-5",
    enabled: true,
    provider: "anthropic",
    model: "claude-opus-5",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  } as Routine;
}

describe("applyOptimisticRoutineUpdate", () => {
  it("moves the schedule and stamps updated_at at once", () => {
    const next = applyOptimisticRoutineUpdate(
      routine(),
      { schedule: "0 7 * * 1-5" },
      NOW,
    );
    strictEqual(next.schedule, "0 7 * * 1-5");
    strictEqual(next.updated_at, NOW);
    strictEqual(next.name, "Daily cut");
  });

  it("leaves undefined keys alone", () => {
    const next = applyOptimisticRoutineUpdate(
      routine(),
      { name: "Renamed", prompt: undefined },
      NOW,
    );
    strictEqual(next.name, "Renamed");
    strictEqual(next.prompt, "Cut a release");
  });

  it("a null clears a pin back to inherit", () => {
    const next = applyOptimisticRoutineUpdate(
      routine(),
      { provider: null, model: null },
      NOW,
    );
    strictEqual("provider" in next, false);
    strictEqual("model" in next, false);
  });

  it("setting a schedule drops an event trigger, and vice versa", () => {
    const trigger = { kind: "webhook" } as unknown as Routine["trigger"];
    const withTrigger = applyOptimisticRoutineUpdate(
      routine(),
      { trigger },
      NOW,
    );
    strictEqual("schedule" in withTrigger, false);
    deepStrictEqual(withTrigger.trigger, trigger);

    const backToCron = applyOptimisticRoutineUpdate(
      withTrigger,
      { schedule: "0 9 * * *", trigger: null },
      NOW,
    );
    strictEqual(backToCron.schedule, "0 9 * * *");
    strictEqual("trigger" in backToCron, false);
  });
});

describe("patchRoutineList", () => {
  it("patches only the addressed routine and keeps other rows identical", () => {
    const other = routine({ id: "r2", name: "Other" });
    const list = [routine(), other];
    const next = patchRoutineList(list, "r1", { enabled: false }, NOW);
    strictEqual(next?.[0]?.enabled, false);
    strictEqual(next?.[1], other);
  });

  it("an empty cache stays empty", () => {
    strictEqual(
      patchRoutineList(undefined, "r1", { enabled: false }, NOW),
      undefined,
    );
  });
});

describe("replaceRoutineInList", () => {
  it("swaps the host's applied routine in for the guess", () => {
    const applied = routine({ schedule: "0 7 * * 1-5", updated_at: NOW });
    const next = replaceRoutineInList([routine()], applied);
    strictEqual(next?.[0], applied);
  });

  it("ignores an answer without an id (a non-hosted adapter's empty echo)", () => {
    const list = [routine()];
    strictEqual(replaceRoutineInList(list, {} as Routine), list);
  });
});
