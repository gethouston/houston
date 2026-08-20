/**
 * Forced-update model (pure logic; `useUpdateChecker` + the dialog consume it).
 *
 * Houston updates are not optional: every release the updater finds gets
 * installed. The only question is presentation, keyed on WHEN it was found:
 *
 * - `launch` — the launch check found it. The user has not started working
 *   yet, so install immediately behind a blocking "upgrading Houston" overlay
 *   and relaunch into the new version.
 * - `countdown` — a background re-check found it mid-session. Show a blocking
 *   dialog with a visible countdown: update now, or it installs itself when
 *   the timer runs out. The copy reassures that agents keep working and
 *   chats/settings survive the restart.
 *
 * Detection stays pull-based: the Tauri updater polls the release feed's
 * manifest. There is no push channel to a desktop build, and no server-side
 * backstop either (the hosted gateway's 426 min-version floor was retired,
 * PRODUCT-1144), so freshness comes entirely from cadence: a launch check, a
 * short interval, and a re-check when the window regains focus. That makes a
 * client whose checks keep FAILING (a proxy or region block between it and
 * the release feed) invisible and permanently stale — so consecutive check
 * failures are counted here, and a stuck client surfaces itself: telemetry
 * plus one visible "get it manually" nudge per run (PRODUCT-1386).
 */

export type UpdateOrigin = "launch" | "poll";
export type ForcedUpdateMode = "launch" | "countdown";

/** Seconds the mid-session dialog counts down before installing on its own. */
export const FORCED_UPDATE_COUNTDOWN_SECONDS = 60;

/** Background re-check cadence. Short enough that an active user is on the
 *  new version within minutes of publish; long enough not to hammer the
 *  release feed from every install all day. */
export const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/** Minimum gap before a window-focus re-check fires — focus events come in
 *  bursts (Cmd-Tab flurries) and must not turn into a request storm. */
export const FOCUS_RECHECK_MIN_GAP_MS = 60 * 1000;

/** Which forced presentation a found update gets. */
export function forcedUpdateMode(origin: UpdateOrigin): ForcedUpdateMode {
  return origin === "launch" ? "launch" : "countdown";
}

/** True when a focus-triggered re-check is due. */
export function shouldRecheckOnFocus(
  lastCheckAt: number | null,
  now: number,
): boolean {
  return lastCheckAt === null || now - lastCheckAt >= FOCUS_RECHECK_MIN_GAP_MS;
}

/** One countdown tick. Floors at zero so a late timer can never go negative. */
export function tickCountdown(seconds: number): number {
  return Math.max(0, seconds - 1);
}

/** What one update check produced, as the failure counter sees it. `skipped`
 *  covers checks that never ran (an install already in flight) — no signal
 *  in either direction. */
export type UpdateCheckOutcome = "found" | "none" | "failed" | "skipped";

/** Consecutive failures before a client counts as stuck: the launch check
 *  plus two interval polls, ~10 minutes into a session. One offline blip
 *  never trips it; a proxy that blocks the release feed always does. */
export const UPDATE_CHECK_STUCK_THRESHOLD = 3;

/** The failure-streak transition: any completed check resets it, a failure
 *  extends it, a skipped check leaves it alone. */
export function nextCheckFailureStreak(
  streak: number,
  outcome: UpdateCheckOutcome,
): number {
  if (outcome === "failed") return streak + 1;
  if (outcome === "skipped") return streak;
  return 0;
}

/** True the moment a failure streak first reaches the stuck threshold —
 *  exactly once per streak, so a stuck client surfaces once per run instead
 *  of once per poll. */
export function updateCheckJustStuck(streak: number): boolean {
  return streak === UPDATE_CHECK_STUCK_THRESHOLD;
}
