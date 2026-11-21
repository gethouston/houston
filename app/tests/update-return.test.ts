import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";
import { UPDATE_CHECK_INTERVAL_MS } from "../src/lib/update-policy.ts";
import {
  type AbsenceEvent,
  type AbsenceState,
  absenceStep,
  draftPending,
  initialAbsence,
  LONG_ABSENCE_MS,
  type ReturnInputs,
  returnAction,
  returnLossHold,
  SLEEP_GAP_MS,
  windowInFront,
} from "../src/lib/update-return.ts";
import type { UpdateStatus } from "../src/lib/update-status.ts";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const T0 = 1_700_000_000_000;
const TICK = UPDATE_CHECK_INTERVAL_MS;

function run(start: AbsenceState, events: AbsenceEvent[]): number[] {
  let state = start;
  const returns: number[] = [];
  events.forEach((event, index) => {
    const step = absenceStep(state, event);
    state = step.state;
    if (step.returned) returns.push(index);
  });
  return returns;
}

describe("absenceStep", () => {
  it("treats a short blur as nothing", () => {
    deepStrictEqual(
      run(initialAbsence(T0), [
        { kind: "blur", at: T0 + 1_000 },
        { kind: "focus", at: T0 + 20 * MINUTE },
      ]),
      [],
    );
  });

  it("reports a return once after a blur of the threshold or longer", () => {
    deepStrictEqual(
      run(initialAbsence(T0), [
        { kind: "blur", at: T0 },
        { kind: "focus", at: T0 + LONG_ABSENCE_MS },
        { kind: "focus", at: T0 + LONG_ABSENCE_MS + 10 },
      ]),
      [1],
    );
  });

  it("keeps the first goodbye's clock when a hide follows a blur", () => {
    deepStrictEqual(
      run(initialAbsence(T0), [
        { kind: "blur", at: T0 },
        { kind: "hidden", at: T0 + 3 * HOUR },
        { kind: "focus", at: T0 + 4 * HOUR },
      ]),
      [2],
    );
  });

  it("counts hidden as away but an unfocused visibility change as no return", () => {
    deepStrictEqual(
      run(initialAbsence(T0), [
        { kind: "hidden", at: T0 },
        { kind: "visible", at: T0 + 5 * HOUR, focused: false },
        { kind: "focus", at: T0 + 5 * HOUR + 1 },
      ]),
      [2],
    );
  });

  it("returns once at the unlock of a desktop locked overnight", () => {
    const ticks: AbsenceEvent[] = [];
    for (let at = T0 + TICK; at <= T0 + 8 * HOUR; at += TICK) {
      ticks.push({ kind: "tick", at, focused: false });
    }
    deepStrictEqual(
      run(initialAbsence(T0), [
        { kind: "hidden", at: T0 },
        ...ticks,
        { kind: "visible", at: T0 + 8 * HOUR + 1, focused: true },
        { kind: "tick", at: T0 + 8 * HOUR + TICK, focused: true },
      ]),
      [ticks.length + 1],
    );
  });

  it("does not arm on a short sleep", () => {
    deepStrictEqual(
      run(initialAbsence(T0), [
        { kind: "tick", at: T0 + TICK, focused: true },
        { kind: "tick", at: T0 + 2 * TICK + 15 * MINUTE, focused: true },
      ]),
      [],
    );
  });

  it("returns at the wake tick after a long sleep with the window focused", () => {
    deepStrictEqual(
      run(initialAbsence(T0), [
        { kind: "tick", at: T0 + TICK, focused: true },
        { kind: "tick", at: T0 + TICK + 5 * HOUR, focused: true },
      ]),
      [1],
    );
  });

  it("dates a sleep from the last tick before it", () => {
    const lastTick = T0 + TICK;
    deepStrictEqual(
      run(initialAbsence(T0), [
        { kind: "tick", at: lastTick, focused: true },
        { kind: "tick", at: lastTick + LONG_ABSENCE_MS - 1, focused: true },
      ]),
      [],
    );
    deepStrictEqual(
      run(initialAbsence(T0), [
        { kind: "tick", at: lastTick, focused: true },
        { kind: "tick", at: lastTick + LONG_ABSENCE_MS, focused: true },
      ]),
      [1],
    );
  });

  it("holds a sleep seen with the window away until the focus", () => {
    deepStrictEqual(
      run(initialAbsence(T0), [
        { kind: "blur", at: T0 + 1_000 },
        { kind: "tick", at: T0 + 5 * HOUR, focused: false },
        { kind: "tick", at: T0 + 5 * HOUR + TICK, focused: false },
        { kind: "focus", at: T0 + 5 * HOUR + TICK + 5 },
      ]),
      [3],
    );
  });

  it("reports one return for a focus followed by the late tick", () => {
    deepStrictEqual(
      run(initialAbsence(T0), [
        { kind: "blur", at: T0 },
        { kind: "focus", at: T0 + 5 * HOUR },
        { kind: "tick", at: T0 + 5 * HOUR + 1_000, focused: true },
      ]),
      [1],
    );
  });

  it("reports one return for a late tick followed by the focus", () => {
    deepStrictEqual(
      run(initialAbsence(T0), [
        { kind: "blur", at: T0 },
        { kind: "tick", at: T0 + 5 * HOUR, focused: true },
        { kind: "focus", at: T0 + 5 * HOUR + 1_000 },
      ]),
      [1],
    );
  });

  it("ignores a tick that is merely late, not asleep", () => {
    deepStrictEqual(
      run(initialAbsence(T0), [
        { kind: "tick", at: T0 + TICK + SLEEP_GAP_MS - 1, focused: true },
      ]),
      [],
    );
  });

  it("keeps a hidden window's absence through its ticks", () => {
    deepStrictEqual(
      run(initialAbsence(T0), [
        { kind: "hidden", at: T0 },
        { kind: "tick", at: T0 + TICK, focused: false },
        { kind: "tick", at: T0 + 2 * TICK, focused: false },
        { kind: "focus", at: T0 + 6 * HOUR },
      ]),
      [3],
    );
  });

  it("forgets an absence no focus closed once a tick finds the window in front", () => {
    deepStrictEqual(
      run(initialAbsence(T0), [
        { kind: "blur", at: T0 },
        { kind: "tick", at: T0 + TICK, focused: true },
        { kind: "blur", at: T0 + 6 * HOUR },
        { kind: "focus", at: T0 + 6 * HOUR + 1 },
      ]),
      [],
    );
  });

  it("arms nothing on a remount", () => {
    const mountedAt = T0 + 9 * HOUR;
    deepStrictEqual(
      run(initialAbsence(mountedAt), [
        { kind: "focus", at: mountedAt + 1 },
        { kind: "tick", at: mountedAt + TICK, focused: true },
      ]),
      [],
    );
  });

  it("starts a fresh absence after a return", () => {
    deepStrictEqual(
      run(initialAbsence(T0), [
        { kind: "blur", at: T0 },
        { kind: "focus", at: T0 + 5 * HOUR },
        { kind: "blur", at: T0 + 5 * HOUR + 1 },
        { kind: "focus", at: T0 + 5 * HOUR + 2 },
      ]),
      [1],
    );
  });
});

const info = { currentVersion: "0.6.23", version: "1.0.8", origin: "poll" };
const downloaded: UpdateStatus = { state: "downloaded", info } as const;
const clear: ReturnInputs = {
  status: downloaded,
  engineRemote: true,
  turnInFlight: false,
  draftPending: false,
};

describe("returnAction", () => {
  it("installs the release a poll already staged", () => {
    deepStrictEqual(returnAction(clear), { kind: "install" });
  });

  it("runs the ordinary check, never an install, with nothing staged", () => {
    const unstaged: UpdateStatus[] = [
      { state: "idle" },
      { state: "available", info },
      { state: "error", info, phase: "download" },
      { state: "error", info: { ...info, origin: "return" }, phase: "install" },
    ];
    for (const status of unstaged) {
      deepStrictEqual(returnAction({ ...clear, status }), { kind: "check" });
    }
  });

  it("never installs on a local-engine build", () => {
    deepStrictEqual(returnAction({ ...clear, engineRemote: false }), {
      kind: "check",
    });
  });

  it("holds for a turn this device sent, and says so", () => {
    deepStrictEqual(returnAction({ ...clear, turnInFlight: true }), {
      kind: "hold",
      reason: "turn",
    });
  });

  it("holds for an unsent draft, and says so", () => {
    deepStrictEqual(returnAction({ ...clear, draftPending: true }), {
      kind: "hold",
      reason: "draft",
    });
  });

  it("holds while the updater is mid-step, and says so", () => {
    deepStrictEqual(
      returnAction({
        ...clear,
        status: { state: "downloading", info, progress: 40 },
      }),
      { kind: "hold", reason: "busy" },
    );
    deepStrictEqual(
      returnAction({ ...clear, status: { state: "installing", info } }),
      { kind: "hold", reason: "busy" },
    );
  });
});

describe("windowInFront", () => {
  const doc = (
    hasFocus: boolean,
    visibilityState: DocumentVisibilityState,
  ) => ({
    hasFocus: () => hasFocus,
    visibilityState,
  });

  it("needs the key window on screen, so a locked desktop reads as away", () => {
    strictEqual(windowInFront(doc(true, "visible")), true);
    strictEqual(windowInFront(doc(true, "hidden")), false);
    strictEqual(windowInFront(doc(false, "visible")), false);
  });
});

describe("returnLossHold", () => {
  it("names the turn before the draft, and nothing when both are clear", () => {
    strictEqual(
      returnLossHold({ turnInFlight: true, draftPending: true }),
      "turn",
    );
    strictEqual(
      returnLossHold({ turnInFlight: false, draftPending: true }),
      "draft",
    );
    strictEqual(
      returnLossHold({ turnInFlight: false, draftPending: false }),
      null,
    );
  });
});

describe("draftPending", () => {
  it("is false for empty composers and no parked card", () => {
    strictEqual(
      draftPending({ "chat-a": { text: "   ", files: [] } }, {}),
      false,
    );
  });

  it("is true for words, for files, and for a half-walked card", () => {
    strictEqual(
      draftPending({ "chat-a": { text: "hi", files: [] } }, {}),
      true,
    );
    strictEqual(
      draftPending({ "chat-a": { text: "", files: [{ name: "x" }] } }, {}),
      true,
    );
    strictEqual(draftPending({}, { "chat-a": { key: "k" } }), true);
  });
});
