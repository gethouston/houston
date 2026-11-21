import { deepStrictEqual } from "node:assert";
import { describe, it } from "node:test";
import {
  CompletionLatches,
  type LatchTimers,
} from "../src/hooks/completion-latches.ts";

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

    latches.fireForAgent("Work/Sales");
    deepStrictEqual(sent, []);

    ready = true;
    latches.fireForAgent("Work/Sales");
    deepStrictEqual(sent, ["s1"]);

    latches.fireForAgent("Work/Sales");
    deepStrictEqual(sent, ["s1"]);
  });

  it("does NOT fire a sibling latch whose settle has not folded yet (the bug)", () => {
    const timers = fakeTimers();
    const latches = new CompletionLatches(2000, timers);
    const body: string[] = [];
    const foldedA = { done: false };
    const foldedB = { done: false };

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

    foldedA.done = true;
    latches.fireForAgent("Work/Sales");
    deepStrictEqual(body, ["A:plain"]);

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
      () => false,
      () => sent.push("s1"),
    );

    latches.fireForAgent("Work/Sales");
    deepStrictEqual(sent, []);

    timers.runAll();
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
