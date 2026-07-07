import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  CompletionLatches,
  type LatchTimers,
} from "../src/hooks/completion-latches.ts";

/**
 * A controllable clock: latch timers never fire on their own; the test runs
 * them explicitly via `runAll` to exercise the grace backstop.
 */
function fakeTimers(): LatchTimers & { runAll: () => void } {
  const pending = new Map<number, () => void>();
  let next = 1;
  return {
    set(fn) {
      const id = next++;
      pending.set(id, fn);
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clear(handle) {
      pending.delete(handle as unknown as number);
    },
    runAll() {
      for (const [id, fn] of [...pending]) {
        pending.delete(id);
        fn();
      }
    },
  };
}

describe("CompletionLatches", () => {
  it("fires a session's notification on its own echo once the settle folded", () => {
    const timers = fakeTimers();
    const latches = new CompletionLatches(2000, timers);
    const sent: string[] = [];
    let ready = false;

    latches.latch(
      "Work/Sales",
      "s1",
      () => ready,
      () => sent.push("s1"),
    );

    // Echo before the fold: nothing fires yet.
    latches.fireForAgent("Work/Sales");
    deepStrictEqual(sent, []);

    // The settle folds; its own echo now fires.
    ready = true;
    latches.fireForAgent("Work/Sales");
    deepStrictEqual(sent, ["s1"]);

    // A later echo is a no-op (the latch is gone).
    latches.fireForAgent("Work/Sales");
    deepStrictEqual(sent, ["s1"]);
  });

  it("does NOT fire a sibling latch whose settle has not folded yet (the bug)", () => {
    const timers = fakeTimers();
    const latches = new CompletionLatches(2000, timers);
    // Body each session WOULD send, resolved from its own fold state at fire
    // time — the real hook reads the VM interaction the same way.
    const body: string[] = [];
    const foldedA = { done: false };
    const foldedB = { done: false };

    // A finishes cleanly; B ends on a question. Both are latched for the SAME
    // agent, before either settle folds.
    latches.latch(
      "Work/Sales",
      "A",
      () => foldedA.done,
      () => body.push(foldedA.done ? "A:plain" : "A:unfolded"),
    );
    latches.latch(
      "Work/Sales",
      "B",
      () => foldedB.done,
      () => body.push(foldedB.done ? "B:question" : "B:plain"),
    );

    // A's settle folds and emits `ActivityChanged` (no session key). Pre-fix,
    // the handler fired EVERY latch for the agent, so B fired here — unfolded —
    // and would have sent "B:plain", then been discarded.
    foldedA.done = true;
    latches.fireForAgent("Work/Sales");
    deepStrictEqual(body, ["A:plain"]);

    // B's own settle folds; its echo fires with the correct question body.
    foldedB.done = true;
    latches.fireForAgent("Work/Sales");
    deepStrictEqual(body, ["A:plain", "B:question"]);
  });

  it("grace timer force-fires a completed session that never folds a board card", () => {
    const timers = fakeTimers();
    const latches = new CompletionLatches(2000, timers);
    const sent: string[] = [];

    latches.latch(
      "Work/Sales",
      "s1",
      () => false, // no board card ever folds
      () => sent.push("s1"),
    );

    latches.fireForAgent("Work/Sales");
    deepStrictEqual(sent, []); // gate holds

    timers.runAll(); // backstop
    deepStrictEqual(sent, ["s1"]);
  });

  it("scopes fires by agent path", () => {
    const timers = fakeTimers();
    const latches = new CompletionLatches(2000, timers);
    const sent: string[] = [];

    latches.latch(
      "Work/Sales",
      "s1",
      () => true,
      () => sent.push("sales"),
    );
    latches.latch(
      "Work/Ops",
      "s2",
      () => true,
      () => sent.push("ops"),
    );

    latches.fireForAgent("Work/Ops");
    deepStrictEqual(sent, ["ops"]);
  });

  it("dispose clears pending latches so nothing fires after teardown", () => {
    const timers = fakeTimers();
    const latches = new CompletionLatches(2000, timers);
    const sent: string[] = [];

    latches.latch(
      "Work/Sales",
      "s1",
      () => true,
      () => sent.push("s1"),
    );
    latches.dispose();

    latches.fireForAgent("Work/Sales");
    timers.runAll();
    deepStrictEqual(sent, []);
  });
});
