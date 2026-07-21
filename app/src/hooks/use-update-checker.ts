import { useCallback, useEffect, useRef, useState } from "react";
import { analytics } from "../lib/analytics";
import {
  type ForcedUpdateMode,
  forcedUpdateMode,
  shouldRecheckOnFocus,
  UPDATE_CHECK_INTERVAL_MS,
} from "../lib/update-force";
import { useUpdateMachine } from "./use-update-machine";
import { useUpdateRequired } from "./use-update-required";

export type {
  InstallSource,
  UpdateInfo,
  UpdateStatus,
} from "./use-update-machine";

/**
 * Update policy: updates are forced. The machine (use-update-machine) knows
 * HOW to install; this hook decides WHEN — a launch check plus a short
 * interval plus a focus re-check — and latches the forced presentation the
 * moment an update is found:
 *
 * - found by the launch check → install immediately (blocking overlay),
 * - found mid-session → the countdown dialog installs it when the timer runs
 *   out unless the user updates sooner.
 *
 * The hosted gateway's hard version floor (`required`) rides beside this and
 * takes precedence in the UI.
 */
export function useUpdateChecker() {
  const { status, runCheck, installAndRelaunch, relaunchInstalledApp } =
    useUpdateMachine();
  const lastCheckAtRef = useRef<number | null>(null);

  const check = useCallback(() => {
    lastCheckAtRef.current = Date.now();
    return runCheck();
  }, [runCheck]);

  const required = useUpdateRequired(check);

  // The forced presentation, latched on the first transition into
  // "available" and kept for the rest of the run (the process relaunches to
  // clear it). PROD-only: in dev the only way runCheck fires is the 426 kick,
  // and auto-installing the shipped build over a dev bundle would be hostile —
  // the UpdateRequired screen already covers that path with a manual button.
  const [forcedMode, setForcedMode] = useState<ForcedUpdateMode | null>(null);
  const forcedModeRef = useRef<ForcedUpdateMode | null>(null);
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    if (status.state !== "available" || forcedModeRef.current) return;
    const mode = forcedUpdateMode(status.origin);
    forcedModeRef.current = mode;
    setForcedMode(mode);
    analytics.track("update_forced", {
      source: mode,
      from_version: status.info.currentVersion,
      to_version: status.info.version,
    });
    // Launch-time find: the user hasn't started working, install right away.
    // Mid-session the countdown dialog owns the trigger.
    if (mode === "launch") void installAndRelaunch("launch");
  }, [status, installAndRelaunch]);

  useEffect(() => {
    // The updater pings the production release feed and would offer the
    // shipped build over a local dev build (e.g. `pnpm tauri dev`) — there's
    // nothing sensible to install over a dev bundle, so it just nags. Only
    // run in packaged production builds. (Matches App.tsx's
    // `import.meta.env.PROD` gating idiom; on web the updater is shimmed to a
    // no-op regardless.)
    if (!import.meta.env.PROD) return;
    void check();
    const interval = setInterval(check, UPDATE_CHECK_INTERVAL_MS);
    // Returning to the app is the moment a forced update is least disruptive
    // and most expected — re-check then, throttled against focus bursts.
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

  return {
    status,
    required,
    forcedMode,
    installAndRelaunch,
    relaunchInstalledApp,
  };
}
