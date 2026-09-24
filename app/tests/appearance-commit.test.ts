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

type Answer = (
  patch: Partial<ThemePreference>,
  previous: ThemePreference,
) => Promise<ThemePreference>;

const accept: Answer = async (patch, previous) => ({ ...previous, ...patch });

/**
 * A committer whose paint, write and reporting are all observable.
 *
 * `paintsOnPersist` gives the write seam the behaviour the persisting call used
 * to have: it painted the preference it had just stored. That is a seam the
 * committer must survive, because a pick made while the write was in flight owns
 * the screen and the write's own result is by then a preference nobody chose.
 */
function harness(answer: Answer = accept, paintsOnPersist = false) {
  const painted: ThemePreference[] = [];
  const shown: ThemePreference[] = [];
  const writes: Recorded[] = [];
  const reported: { label: string; err: unknown }[] = [];
  const clock = new FakeSchedule();
  const apply = (p: ThemePreference): void => void painted.push(p);
  const committer = createAppearanceCommitter(SAVED, (p) => shown.push(p), {
    apply,
    persist: async (patch, previous) => {
      writes.push({ patch, previous });
      const next = await answer(patch, previous);
      if (paintsOnPersist) apply(next);
      return next;
    },
    schedule: clock.schedule,
    report: (label, err) => reported.push({ label, err }),
  });
  return { committer, clock, painted, shown, writes, reported };
}

/** A write the test finishes by hand, so a pick can land while it is in flight. */
function held() {
  let resolve: ((pref: ThemePreference) => void) | null = null;
  let reject: ((err: unknown) => void) | null = null;
  const answer: Answer = () =>
    new Promise<ThemePreference>((res, rej) => {
      resolve = res;
      reject = rej;
    });
  return {
    answer,
    finish: async (pref: ThemePreference): Promise<void> => {
      resolve?.(pref);
      await settle();
    },
    fail: async (err: unknown): Promise<void> => {
      reject?.(err);
      await settle();
    },
  };
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
    const write = held();
    const h = harness(write.answer);

    h.committer.commit({ dark: "nord" });
    await h.clock.fire();
    h.committer.commit({ dark: "gruvbox" });
    assert.equal(h.writes.length, 1, "one write at a time");

    await write.finish({ ...SAVED, dark: "nord" });
    await h.clock.fire();

    assert.equal(h.writes.length, 2);
    assert.deepEqual(h.writes[1].previous, { ...SAVED, dark: "nord" });
    assert.equal(h.writes[1].patch.dark, "gruvbox");
  });

  it("leaves the newest pick on screen when the write seam paints its result", async () => {
    const write = held();
    const h = harness(write.answer, true);

    h.committer.commit({ dark: "nord" });
    await h.clock.fire();
    h.committer.commit({ dark: "gruvbox" });
    await write.finish({ ...SAVED, dark: "nord" });

    assert.deepEqual(
      h.painted.at(-1),
      { ...SAVED, dark: "gruvbox" },
      "the write stored the pick before last; the page must still show the last",
    );
    assert.deepEqual(
      h.shown.at(-1),
      h.painted.at(-1),
      "the control and the page must never disagree about the pick in force",
    );
  });

  it("keeps a pick made while a refused write was in flight, and retries it", async () => {
    const write = held();
    const refused = new Error("storage is full");
    const h = harness(write.answer);

    h.committer.commit({ dark: "nord" });
    await h.clock.fire();
    h.committer.commit({ dark: "gruvbox" });
    await write.fail(refused);

    assert.deepEqual(h.reported, [
      { label: "set_theme_preference", err: refused },
    ]);
    assert.deepEqual(
      h.painted.at(-1),
      { ...SAVED, dark: "gruvbox" },
      "the pick that failed is not the pick the user is now looking at",
    );
    assert.deepEqual(h.shown.at(-1), { ...SAVED, dark: "gruvbox" });

    await h.clock.fire();
    assert.equal(h.writes.length, 2, "the newer pick gets its own attempt");
    assert.deepEqual(
      h.writes[1].previous,
      SAVED,
      "nothing was stored, so the retry still diffs against the saved value",
    );
    assert.equal(h.writes[1].patch.dark, "gruvbox");
  });
});

describe("the Appearance committer, disposed", () => {
  it("stores the painted pick at once instead of dropping the timer", async () => {
    const h = harness();

    h.committer.commit({ dark: "nord" });
    h.committer.dispose();
    await settle();

    assert.equal(h.clock.armed, false, "the pending timer is cancelled");
    assert.deepEqual(h.writes, [
      { patch: { ...SAVED, dark: "nord" }, previous: SAVED },
    ]);
  });

  it("writes nothing when the painted pick is already the stored one", async () => {
    const h = harness();

    h.committer.commit({ dark: "nord" });
    await h.clock.fire();
    h.committer.dispose();
    await settle();

    assert.equal(h.writes.length, 1);
  });

  it("finishes a pick left behind an in-flight write, with no timer to wait on", async () => {
    const write = held();
    const h = harness(write.answer);

    h.committer.commit({ dark: "nord" });
    await h.clock.fire();
    h.committer.commit({ dark: "gruvbox" });
    const armsBefore = h.clock.arms;
    h.committer.dispose();
    await write.finish({ ...SAVED, dark: "nord" });

    assert.equal(
      h.clock.arms,
      armsBefore,
      "nobody is picking any more, so the remainder waits on no delay",
    );
    assert.equal(h.writes.length, 2);
    assert.equal(h.writes[1].patch.dark, "gruvbox");
  });

  it("reports a refused write but touches no screen it no longer owns", async () => {
    const write = held();
    const refused = new Error("storage is full");
    const h = harness(write.answer);

    h.committer.commit({ dark: "nord" });
    await h.clock.fire();
    const paints = h.painted.length;
    h.committer.dispose();
    await write.fail(refused);

    assert.deepEqual(h.reported, [
      { label: "set_theme_preference", err: refused },
    ]);
    assert.equal(
      h.painted.length,
      paints,
      "the row is unmounted: a revert would repaint for a control nobody sees",
    );
    assert.equal(h.shown.length, paints);
  });

  it("ignores a pick that arrives after it closed", () => {
    const h = harness();

    h.committer.dispose();
    h.committer.commit({ dark: "nord" });

    assert.deepEqual(h.painted, []);
    assert.deepEqual(h.shown, []);
    assert.equal(h.clock.armed, false);
  });
});
