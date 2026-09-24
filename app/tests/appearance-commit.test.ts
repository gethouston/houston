import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ThemePreference } from "@houston/sdk/appearance";
import {
  type CommitScheduler,
  createAppearanceCommitter,
} from "../src/components/settings/sections/appearance-commit.ts";

/**
 * The Appearance row's writer, driven without React, a DOM or a clock.
 *
 * What is pinned is the shape of a picking BURST: every pick paints at once, the
 * store is written once the picking stops, and the write diffs against the last
 * SAVED preference — not against what is on screen, which is the mistake that
 * makes every pick after the first store nothing.
 */

const SAVED: ThemePreference = {
  mode: "light",
  light: "houston-light",
  dark: "houston-dark",
};

/** Let the committer's promise chain (then → catch → finally) run out. */
const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

/** The trailing-edge delay, in the test's hands: nothing fires until `fire()`. */
class FakeSchedule {
  private pending: (() => void) | null = null;
  arms = 0;
  cancels = 0;

  readonly schedule: CommitScheduler = (fn) => {
    this.pending = fn;
    this.arms += 1;
    return () => {
      this.cancels += 1;
      if (this.pending === fn) this.pending = null;
    };
  };

  get armed(): boolean {
    return this.pending !== null;
  }

  /** Run the pending write and let it settle. */
  async fire(): Promise<void> {
    const fn = this.pending;
    this.pending = null;
    fn?.();
    await settle();
  }
}

interface Recorded {
  patch: Partial<ThemePreference>;
  previous: ThemePreference;
}

/** A committer whose paint, write and reporting are all observable. */
function harness(
  answer: (
    patch: Partial<ThemePreference>,
    previous: ThemePreference,
  ) => Promise<ThemePreference> = async (patch, previous) => ({
    ...previous,
    ...patch,
  }),
) {
  const painted: ThemePreference[] = [];
  const shown: ThemePreference[] = [];
  const writes: Recorded[] = [];
  const reported: { label: string; err: unknown }[] = [];
  const clock = new FakeSchedule();
  const committer = createAppearanceCommitter(SAVED, (p) => shown.push(p), {
    apply: (p) => painted.push(p),
    persist: (patch, previous) => {
      writes.push({ patch, previous });
      return answer(patch, previous);
    },
    schedule: clock.schedule,
    report: (label, err) => reported.push({ label, err }),
  });
  return { committer, clock, painted, shown, writes, reported };
}

describe("the Appearance committer", () => {
  it("paints and moves the control on every pick, before any write", () => {
    const h = harness();

    h.committer.commit({ dark: "nord" });
    h.committer.commit({ dark: "gruvbox" });

    assert.deepEqual(
      h.painted.map((p) => p.dark),
      ["nord", "gruvbox"],
      "each pick paints at once: picking palettes is how a person sees them",
    );
    assert.deepEqual(h.shown, h.painted, "the control shows what is painted");
    assert.deepEqual(h.writes, [], "nothing is stored while picks keep coming");
  });

  it("stores ONE preference for a burst of picks: the last one", async () => {
    const h = harness();

    h.committer.commit({ dark: "nord" });
    h.committer.commit({ mode: "dark" });
    h.committer.commit({ dark: "gruvbox" });
    await h.clock.fire();

    assert.equal(h.writes.length, 1);
    assert.deepEqual(h.writes[0], {
      patch: { mode: "dark", light: "houston-light", dark: "gruvbox" },
      previous: SAVED,
    });
  });

  it("diffs the next burst against what the write SAVED", async () => {
    const h = harness();

    h.committer.commit({ dark: "nord" });
    await h.clock.fire();
    h.committer.commit({ dark: "gruvbox" });
    await h.clock.fire();

    assert.deepEqual(h.writes[1].previous, { ...SAVED, dark: "nord" });
    assert.equal(h.writes[1].patch.dark, "gruvbox");
  });

  it("writes nothing when the pick is the preference already saved", async () => {
    const h = harness();

    h.committer.commit({ dark: SAVED.dark });
    await h.clock.fire();

    assert.deepEqual(h.writes, []);
  });

  it("repaints the saved preference and reports when a write is refused", async () => {
    const refused = new Error("storage is full");
    const h = harness(() => Promise.reject(refused));

    h.committer.commit({ dark: "nord" });
    await h.clock.fire();

    assert.deepEqual(h.reported, [
      { label: "set_theme_preference", err: refused },
    ]);
    assert.deepEqual(
      h.painted.at(-1),
      SAVED,
      "the store still holds the previous choice, so the screen must too",
    );
    assert.deepEqual(h.shown.at(-1), SAVED);
    assert.equal(
      h.clock.armed,
      false,
      "a refused write is not retried behind the user's back",
    );
  });

  it("stores a pick made while a write is still in flight", async () => {
    let release: ((pref: ThemePreference) => void) | null = null;
    const h = harness(
      (patch, previous) =>
        new Promise<ThemePreference>((resolve) => {
          release = () => resolve({ ...previous, ...patch });
        }),
    );

    h.committer.commit({ dark: "nord" });
    await h.clock.fire();
    h.committer.commit({ dark: "gruvbox" });
    assert.equal(h.writes.length, 1, "one write at a time");

    release?.();
    await settle();
    await h.clock.fire();

    assert.equal(h.writes.length, 2);
    assert.deepEqual(h.writes[1].previous, { ...SAVED, dark: "nord" });
    assert.equal(h.writes[1].patch.dark, "gruvbox");
  });
});
