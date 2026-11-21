import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { analytics } from "../lib/analytics";
import {
  type AvailableUpdate,
  type CheckResult,
  runUpdateCheck,
} from "../lib/update-check";
import { downloadReleaseBytes } from "../lib/update-download";
import { updateDownloadOutcome } from "../lib/update-download-failure";
import { reportUpdateDownloadFailure } from "../lib/update-download-report";
import { installStagedRelease } from "../lib/update-install";
import { claimLaunchCheck } from "../lib/update-launch-claim";
import {
  type DownloadTrigger,
  shouldReportDownloadFailure,
  shouldSkipDownload,
} from "../lib/update-policy";
import { relaunchInstalledRelease } from "../lib/update-relaunch";
import type { ReturnHold } from "../lib/update-return";
import {
  type InstallSource,
  type UpdateInfo,
  type UpdateStatus,
  updateCheckBlocked,
} from "../lib/update-status";

export type { InstallSource, UpdateInfo, UpdateStatus };

export function useUpdateMachine({ returnHold }: { returnHold: ReturnHold }) {
  const [status, setStatus] = useState<UpdateStatus>({ state: "idle" });
  const updateRef = useRef<AvailableUpdate | null>(null);
  const infoRef = useRef<UpdateInfo | null>(null);
  const statusRef = useRef<UpdateStatus>(status);
  const returnHoldRef = useRef(returnHold);
  const busyRef = useRef(false);
  const appPathRef = useRef<string | null>(null);
  const bytesRidRef = useRef<number | null>(null);
  const reportedRef = useRef<string | null>(null);
  const gaveUpRef = useRef<string | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);
  useEffect(() => {
    returnHoldRef.current = returnHold;
  }, [returnHold]);

  const runCheck = useCallback(async (): Promise<CheckResult> => {
    const origin = claimLaunchCheck();
    if (busyRef.current || updateCheckBlocked(statusRef.current)) {
      return { outcome: "skipped" };
    }
    const { result, found } = await runUpdateCheck(origin, statusRef.current);
    if (result.outcome === "none") {
      updateRef.current = null;
      infoRef.current = null;
      setStatus({ state: "idle" });
    } else if (found) {
      updateRef.current = found.update;
      infoRef.current = found.info;
      setStatus({ state: "available", info: found.info });
    }
    return result;
  }, []);

  const download = useCallback(
    async (trigger: DownloadTrigger): Promise<boolean> => {
      const update = updateRef.current;
      const info = infoRef.current;
      if (!update || !info || busyRef.current) return false;
      if (statusRef.current.state === "downloaded") return true;
      if (shouldSkipDownload(gaveUpRef.current, info.version, trigger))
        return false;

      busyRef.current = true;
      try {
        setStatus({ state: "downloading", info, progress: null });
        bytesRidRef.current = await downloadReleaseBytes(
          update.rid,
          info.origin,
          (progress) => setStatus({ state: "downloading", info, progress }),
        );
        setStatus({ state: "downloaded", info });
        analytics.track("update_downloaded", {
          from_version: info.currentVersion,
          to_version: info.version,
          source: info.origin,
        });
        return true;
      } catch (error) {
        const outcome = updateDownloadOutcome(error);
        if (outcome === "give_up") gaveUpRef.current = info.version;
        if (outcome !== "skip") {
          console.error("[updater] download failed", error);
          if (shouldReportDownloadFailure(reportedRef.current, info.version)) {
            reportedRef.current = info.version;
            reportUpdateDownloadFailure(info.version, error);
          }
        }
        setStatus({ state: "error", info, phase: "download" });
        return false;
      } finally {
        busyRef.current = false;
      }
    },
    [],
  );

  const relaunchInstalledApp = useCallback(async () => {
    const info = infoRef.current;
    if (!info) return;
    if (!(await relaunchInstalledRelease(info.version, appPathRef.current)))
      setStatus({ state: "error", info, phase: "relaunch" });
  }, []);

  const installAndRelaunch = useCallback(
    async (source: InstallSource) => {
      if (busyRef.current) return;
      if (statusRef.current.state !== "downloaded") {
        if (source === "return" || !(await download(source))) return;
      }
      const update = updateRef.current;
      const found = infoRef.current;
      const bytesRid = bytesRidRef.current;
      if (!update || !found || bytesRid === null) return;
      const info: UpdateInfo =
        source === "return" ? { ...found, origin: "return" } : found;

      busyRef.current = true;
      flushSync(() => setStatus({ state: "installing", info }));
      const result = await installStagedRelease({
        rid: update.rid,
        bytesRid,
        info,
        source,
        lastLook: () => (source === "return" ? returnHoldRef.current() : null),
      });
      busyRef.current = false;
      if (result.outcome === "held") {
        setStatus({ state: "downloaded", info: found });
        return;
      }
      if (result.outcome === "failed") {
        setStatus({ state: "error", info, phase: "install" });
        return;
      }
      appPathRef.current = result.appPath;
      bytesRidRef.current = null;
      await relaunchInstalledApp();
    },
    [download, relaunchInstalledApp],
  );

  const currentStatus = useCallback(() => statusRef.current, []);

  return {
    status,
    currentStatus,
    runCheck,
    download,
    installAndRelaunch,
    relaunchInstalledApp,
  };
}
