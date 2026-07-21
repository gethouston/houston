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
 * Detection stays pull-based: the Tauri updater polls `latest.json` on the
 * release feed. There is no push channel to a desktop build (the hosted
 * gateway's 426 version floor covers the must-update-NOW case per request),
 * so freshness comes from cadence: a launch check, a short interval, and a
 * re-check when the window regains focus.
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
