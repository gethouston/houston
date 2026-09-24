/**
 * The Appearance row's writer: paint every pick at once, save once the picking
 * stops.
 *
 * Picking a palette is a browsing act — a person clicks through tiles to SEE
 * them — so each pick paints immediately and nothing waits on a write. The write
 * itself is debounced on the trailing edge, so a burst of six picks stores one
 * preference instead of six.
 *
 * The rule that makes the burst correct: the write diffs against the last SAVED
 * preference, never against what is on screen. Diffing against the painted value
 * would make every pick after the first look like a no-op and store nothing.
 *
 * A refused write is not cosmetic: the store still holds the previous choice, so
 * leaving the new colours up would show a preference nobody saved. The committer
 * repaints the saved one (an apply never writes, so the revert cannot fail in
 * turn) and reports.
 *
 * No React and no DOM of its own — the paint, the write, the clock and the
 * reporter are injected — so the burst behaviour is unit-testable
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
  /** Store a patch against the preference already saved. */
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
}

/**
 * Build the row's committer. `saved` is the preference already stored — the row
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

  const flush = (): void => {
    cancel = null;
    // One write at a time: a pick made mid-write waits for it, so the two can
    // never race over which preference is the stored one.
    if (writing) return void arm();
    if (sameTheme(painted, stored)) return;
    writing = true;
    const attempt = painted;
    void persist(attempt, stored)
      .then((next) => {
        stored = next;
      })
      .catch((err: unknown) => {
        report("set_theme_preference", err);
        painted = stored;
        apply(stored);
        onPref(stored);
      })
      .finally(() => {
        writing = false;
        // A pick landed while this write was in flight: store that one too.
        if (!sameTheme(painted, stored)) arm();
      });
  };

  const arm = (): void => {
    cancel?.();
    cancel = schedule(flush);
  };

  return {
    commit(patch) {
      painted = { ...painted, ...patch };
      apply(painted);
      onPref(painted);
      arm();
    },
  };
}
