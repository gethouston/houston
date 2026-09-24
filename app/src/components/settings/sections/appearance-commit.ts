/**
 * The Appearance row's writer: paint every pick at once, save once the picking
 * stops.
 *
 * Picking a palette is a browsing act, because a person clicks through tiles to
 * SEE them, so each pick paints immediately and nothing waits on a write. The
 * write itself is debounced on the trailing edge, so a burst of six picks stores
 * one preference instead of six.
 *
 * The rule that makes the burst correct: the write diffs against the last SAVED
 * preference, never against what is on screen. Diffing against the painted value
 * would make every pick after the first look like a no-op and store nothing.
 *
 * The committer owns the screen, and the LAST pick owns it. A refused write is
 * not cosmetic: the store still holds the previous choice, so leaving the new
 * colours up would show a preference nobody saved, and the committer repaints the
 * saved one (an apply never writes, so the revert cannot fail in turn) and
 * reports. A pick made while that write was in flight outranks it: the attempt
 * that failed is not what the user is looking at, so the newer pick keeps the
 * screen and gets an attempt of its own against the value still stored.
 *
 * No React and no DOM of its own (the paint, the write, the clock and the
 * reporter are all injected), so the burst behaviour is unit-testable
 * (`app/tests/appearance-commit.test.ts`) without rendering the row.
 */

import { sameTheme, type ThemePreference } from "@houston/sdk/appearance";

/** How long the picking has to stop before the preference is stored. */
export const APPEARANCE_COMMIT_DELAY_MS = 250;

/** Run `fn` after the delay; calling the result cancels it. */
export type CommitScheduler = (fn: () => void) => () => void;

const defaultScheduler: CommitScheduler = (fn) => {
  const id = setTimeout(fn, APPEARANCE_COMMIT_DELAY_MS);
  return () => clearTimeout(id);
};

/**
 * Everything the committer reaches the rest of the app through. All three app
 * seams are passed in rather than imported: the row holds them anyway, and a
 * module that imports the engine could not be unit-tested at all.
 */
export interface AppearanceCommitDeps {
  /** Put a preference on screen (`applyThemePreference`, which never writes). */
  apply: (pref: ThemePreference) => void;
  /**
   * Store a patch against the preference already saved, and paint NOTHING: the
   * committer owns the screen (`persistThemePreference`). A seam that painted
   * what it had stored would put a superseded preference back on the page every
   * time a pick landed while its write was in flight.
   */
  persist: (
    patch: Partial<ThemePreference>,
    previous: ThemePreference,
  ) => Promise<ThemePreference>;
  /** Where a refused write goes (`logAndReportError`). */
  report: (label: string, err: unknown) => void;
  /** The trailing-edge delay. Injected by the test; real timers otherwise. */
  schedule?: CommitScheduler;
}

export interface AppearanceCommitter {
  /** Paint this pick now; store the result once the picking stops. */
  commit(patch: Partial<ThemePreference>): void;
  /**
   * Close the committer: the row is going away. The pending delay is cancelled
   * and whatever is painted but unstored is written AT ONCE, because there is no
   * more picking to wait out and the alternative is losing the user's last pick.
   * Nothing touches the screen afterwards.
   */
  dispose(): void;
}

/**
 * Build the row's committer. `saved` is the preference already stored: the row
 * opens on it, and every diff is taken against it until a write lands and moves
 * it forward.
 *
 * `onPref` moves the controls, so the row shows the pick the instant it is made.
 */
export function createAppearanceCommitter(
  saved: ThemePreference,
  onPref: (pref: ThemePreference) => void,
  deps: AppearanceCommitDeps,
): AppearanceCommitter {
  const { apply, persist, report } = deps;
  const schedule = deps.schedule ?? defaultScheduler;

  /** The preference on SCREEN, which runs ahead of the stored one. */
  let painted = saved;
  /** The preference STORED, the value every write diffs against. */
  let stored = saved;
  let cancel: (() => void) | null = null;
  let writing = false;
  let closed = false;

  /** The page and the controls in one step. Silent once the row is gone. */
  const show = (pref: ThemePreference): void => {
    if (closed) return;
    apply(pref);
    onPref(pref);
  };

  /**
   * Store what is painted. One write at a time: a pick made mid-write is picked
   * up by that write's own tail, so the two can never race over which
   * preference is the stored one.
   */
  const write = (): void => {
    if (writing || sameTheme(painted, stored)) return;
    writing = true;
    const attempt = painted;
    void persist(attempt, stored)
      .then((next) => {
        stored = next;
      })
      .catch((err: unknown) => {
        report("set_theme_preference", err);
        // A newer pick already replaced this attempt on screen: it is the one
        // the user chose, so it stays and the tail below gives it its own try.
        if (!sameTheme(painted, attempt)) return;
        painted = stored;
        show(stored);
      })
      .finally(() => {
        writing = false;
        if (sameTheme(painted, stored)) return;
        // A pick landed while this write was in flight, so it owns the screen:
        // re-assert it, then store it too.
        if (closed) return void write();
        show(painted);
        arm();
      });
  };

  const arm = (): void => {
    cancel?.();
    cancel = schedule(() => {
      cancel = null;
      write();
    });
  };

  return {
    commit(patch) {
      if (closed) return;
      painted = { ...painted, ...patch };
      show(painted);
      arm();
    },
    dispose() {
      if (closed) return;
      closed = true;
      cancel?.();
      cancel = null;
      write();
    },
  };
}
