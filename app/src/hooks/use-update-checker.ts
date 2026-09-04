import { useCallback, useEffect, useRef } from "react";
import { currentAppVersion } from "../lib/app-version";
import { showUpdateCheckStuckToast } from "../lib/error-toast";
import {
  nextCheckFailureStreak,
  shouldRecheckOnFocus,
  UPDATE_CHECK_INTERVAL_MS,
  updateCheckJustStuck,
  updatePresentation,
} from "../lib/update-policy";
import { useUpdateMachine } from "./use-update-machine";

export type {
  InstallSource,
  UpdateInfo,
  UpdateStatus,
} from "./use-update-machine";

/**
 * Update policy. The machine (use-update-machine) knows HOW to download and
 * install; this hook decides WHEN: a launch check plus a short interval plus
 * a focus re-check, and what a find does:
 *
 * - found by the launch check → install and relaunch right away (nothing is
 *   running yet; the overlay covers the few seconds it takes),
 * - found mid-session → download silently. The restart pill then waits for
 *   the user's own click; nothing here ever installs or relaunches on its
 *   own, so a running turn or a half-typed message can't be killed by an
 *   update.
 */
export function useUpdateChecker() {
  const {
    status,
    runCheck,
    download,
    installAndRelaunch,
    relaunchInstalledApp,
  } = useUpdateMachine();
  const lastCheckAtRef = useRef<number | null>(null);
  // Consecutive check FAILURES. A client that can never reach the release
  // feed would strand on an old build silently (the check is fail-open) —
  // when the streak first hits the stuck threshold, it surfaces itself:
  // nudge + telemetry, once per streak.
  const failureStreakRef = useRef(0);

  const check = useCallback(async () => {
    lastCheckAtRef.current = Date.now();
    const { outcome, message } = await runCheck();
    failureStreakRef.current = nextCheckFailureStreak(
      failureStreakRef.current,
      outcome,
    );
    if (updateCheckJustStuck(failureStreakRef.current)) {
      showUpdateCheckStuckToast(
        message ?? "unknown check failure",
        failureStreakRef.current,
        currentAppVersion(),
      );
    }
  }, [runCheck]);

  // Every entry into "available" acts once: a launch find installs, a
  // mid-session find downloads. A failed background download lands in
  // `error`, the next check finds the release again and this re-runs, so a
  // blip retries at poll cadence with no loop of its own. PROD-only: the
  // check effect below never fires in dev, and auto-installing the shipped
  // build over a dev bundle would be hostile — belt and suspenders.
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    if (status.state !== "available") return;
    if (updatePresentation(status.info.origin) === "launch") {
      void installAndRelaunch("launch");
    } else {
      void download();
    }
  }, [status, download, installAndRelaunch]);

  useEffect(() => {
    // The updater pings the production release feed and would offer the
    // shipped build over a local dev build (e.g. `pnpm tauri dev`) — there's
    // nothing sensible to install over a dev bundle, so it just nags. Only
    // run in packaged production builds. (On web the updater is shimmed to a
    // no-op regardless.)
    if (!import.meta.env.PROD) return;
    void check();
    const interval = setInterval(check, UPDATE_CHECK_INTERVAL_MS);
    // Returning to the app is a cheap moment to look again, throttled
    // against focus bursts.
    const onFocus = () => {
      if (shouldRecheckOnFocus(lastCheckAtRef.current, Date.now())) {
        void check();
      }
    };
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [check]);

  return { status, installAndRelaunch, relaunchInstalledApp };
}
