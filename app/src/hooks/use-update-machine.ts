import { check } from "@tauri-apps/plugin-updater";
import { useCallback, useEffect, useRef, useState } from "react";
import { analytics } from "../lib/analytics";
import { reportError } from "../lib/error-report";
import {
  osCurrentAppBundlePath,
  osRelaunchAppFromPath,
} from "../lib/os-bridge";
import {
  applyDownloadEvent,
  type DownloadTally,
  EMPTY_DOWNLOAD_TALLY,
} from "../lib/update-download-progress";
import {
  shouldReportDownloadFailure,
  type UpdateCheckOutcome,
  type UpdateOrigin,
} from "../lib/update-policy";
import {
  type InstallSource,
  type UpdateInfo,
  type UpdateStatus,
  updateCheckBlocked,
} from "../lib/update-status";

export type { InstallSource, UpdateInfo, UpdateStatus };

type AvailableUpdate = NonNullable<Awaited<ReturnType<typeof check>>>;

/**
 * The updater state machine: check → available → downloading → downloaded →
 * installing → relaunch (or error). Scheduling (when checks run) and policy
 * (what a find does) live in `useUpdateChecker`; this hook only moves
 * between states.
 *
 * Download and install are two steps on purpose: the release downloads in
 * the background while the user keeps working, and the install (msiexec
 * hand-off + process exit on Windows, bundle swap on macOS) runs only when
 * something explicitly asks for it.
 */
export function useUpdateMachine() {
  const [status, setStatus] = useState<UpdateStatus>({ state: "idle" });
  const updateRef = useRef<AvailableUpdate | null>(null);
  const infoRef = useRef<UpdateInfo | null>(null);
  const statusRef = useRef<UpdateStatus>(status);
  const busyRef = useRef(false);
  const appPathRef = useRef<string | null>(null);
  const firstCheckRef = useRef(true);
  const reportedDownloadFailureRef = useRef<string | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const runCheck = useCallback(async (): Promise<{
    outcome: UpdateCheckOutcome;
    message?: string;
  }> => {
    // The first check of a run is the launch check: the user just opened the
    // app and hasn't started working. Everything after is mid-session.
    const origin: UpdateOrigin = firstCheckRef.current ? "launch" : "poll";
    firstCheckRef.current = false;
    if (busyRef.current || updateCheckBlocked(statusRef.current)) {
      return { outcome: "skipped" };
    }

    try {
      const update = await check();
      if (!update) {
        updateRef.current = null;
        infoRef.current = null;
        setStatus({ state: "idle" });
        return { outcome: "none" };
      }
      const info: UpdateInfo = {
        currentVersion: update.currentVersion,
        version: update.version,
        origin,
      };
      updateRef.current = update;
      infoRef.current = info;
      // `update_offered` fires on the first sighting of a version only, so a
      // recheck (or a retried download) doesn't double-count.
      const previous = statusRef.current;
      if (previous.state === "idle" || previous.info.version !== info.version) {
        analytics.track("update_offered", {
          from_version: info.currentVersion,
          to_version: info.version,
        });
      }
      setStatus({ state: "available", info });
      return { outcome: "found" };
    } catch (error) {
      // Fail-open by design: the staging QA flavor's updater endpoint 404s
      // forever and a launch must never block on the release feed. The
      // checker counts these to surface a client whose checks NEVER succeed.
      console.warn("[updater] check failed", error);
      return {
        outcome: "failed",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }, []);

  /** Fetch the release into the updater's buffer; true once it can be
   *  installed. A failure is reported (once per version), never shown: the
   *  next check finds the release again and the download re-runs. */
  const download = useCallback(async (): Promise<boolean> => {
    const update = updateRef.current;
    const info = infoRef.current;
    if (!update || !info || busyRef.current) return false;
    if (statusRef.current.state === "downloaded") return true;

    busyRef.current = true;
    let tally: DownloadTally = EMPTY_DOWNLOAD_TALLY;
    try {
      setStatus({ state: "downloading", info, progress: null });
      await update.download((event) => {
        const next = applyDownloadEvent(tally, event);
        tally = next.tally;
        setStatus({ state: "downloading", info, progress: next.progress });
      });
      setStatus({ state: "downloaded", info });
      analytics.track("update_downloaded", {
        from_version: info.currentVersion,
        to_version: info.version,
        source: info.origin,
      });
      return true;
    } catch (error) {
      console.error("[updater] download failed", error);
      const reported = reportedDownloadFailureRef.current;
      if (shouldReportDownloadFailure(reported, info.version)) {
        reportedDownloadFailureRef.current = info.version;
        reportError("update_download", `download of ${info.version}`, error);
      }
      setStatus({ state: "error", info, phase: "download" });
      return false;
    } finally {
      busyRef.current = false;
    }
  }, []);

  const relaunchInstalledApp = useCallback(async () => {
    const info = infoRef.current;
    if (!info) return;
    try {
      const appPath = appPathRef.current ?? (await osCurrentAppBundlePath());
      await osRelaunchAppFromPath(appPath);
    } catch (error) {
      console.error("[updater] relaunch failed", error);
      reportError("update_relaunch", `relaunch into ${info.version}`, error);
      setStatus({ state: "error", info, phase: "relaunch" });
    }
  }, []);

  /** Install the downloaded release and relaunch into it; downloads first
   *  when nothing is buffered yet (the launch-time path). On Windows the
   *  install hands off to the installer and exits this process. */
  const installAndRelaunch = useCallback(
    async (source: InstallSource) => {
      if (busyRef.current) return;
      if (statusRef.current.state !== "downloaded" && !(await download()))
        return;
      const update = updateRef.current;
      const info = infoRef.current;
      if (!update || !info) return;

      busyRef.current = true;
      analytics.track("update_accepted", {
        from_version: info.currentVersion,
        to_version: info.version,
        source,
      });
      try {
        // Captured BEFORE the install: on macOS the install moves the bundle.
        appPathRef.current = await osCurrentAppBundlePath();
        setStatus({ state: "installing", info });
        await update.install();
      } catch (error) {
        console.error("[updater] install failed", error);
        reportError("update_install", `install of ${info.version}`, error);
        setStatus({ state: "error", info, phase: "install" });
        return;
      } finally {
        busyRef.current = false;
      }
      await relaunchInstalledApp();
    },
    [download, relaunchInstalledApp],
  );

  return {
    status,
    runCheck,
    download,
    installAndRelaunch,
    relaunchInstalledApp,
  };
}
