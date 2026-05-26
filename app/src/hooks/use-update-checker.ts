import { useState, useEffect, useCallback, useRef } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { analytics } from "../lib/analytics";
import {
  osCurrentAppBundlePath,
  osRelaunchAppFromPath,
} from "../lib/os-bridge";

export interface UpdateInfo {
  currentVersion: string;
  version: string;
  body: string | null;
}

type UpdateErrorPhase = "install" | "relaunch";

type UpdateStatus =
  | { state: "idle" }
  | { state: "available"; info: UpdateInfo }
  | { state: "downloading"; info: UpdateInfo; progress: number | null }
  | { state: "ready"; info: UpdateInfo }
  | { state: "error"; info: UpdateInfo; phase: UpdateErrorPhase };

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
type AvailableUpdate = NonNullable<Awaited<ReturnType<typeof check>>>;

export function useUpdateChecker() {
  const [status, setStatus] = useState<UpdateStatus>({ state: "idle" });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const updateRef = useRef<AvailableUpdate | null>(null);
  const infoRef = useRef<UpdateInfo | null>(null);
  const statusRef = useRef<UpdateStatus>(status);
  const installingRef = useRef(false);
  const appPathRef = useRef<string | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const runCheck = useCallback(async () => {
    if (installingRef.current || statusRef.current.state === "ready") return;

    try {
      const update = await check();
      if (!update) {
        updateRef.current = null;
        infoRef.current = null;
        setStatus({ state: "idle" });
        return;
      }

      const info: UpdateInfo = {
        currentVersion: update.currentVersion,
        version: update.version,
        body: update.body ?? null,
      };

      updateRef.current = update;
      infoRef.current = info;
      // Only fire `update_offered` on the transition into "available" so a
      // 30-min recheck of the same version doesn't double-count.
      if (statusRef.current.state !== "available") {
        analytics.track("update_offered", {
          from_version: info.currentVersion,
          to_version: info.version,
        });
      }
      setStatus({ state: "available", info });
    } catch (error) {
      console.warn("[updater] check failed", error);
    }
  }, []);

  const relaunchInstalledApp = useCallback(async () => {
    const info = infoRef.current;
    if (!info) return;

    try {
      const appPath = appPathRef.current ?? await osCurrentAppBundlePath();
      await osRelaunchAppFromPath(appPath);
    } catch (error) {
      console.error("[updater] relaunch failed", error);
      setStatus({ state: "error", info, phase: "relaunch" });
    }
  }, []);

  const installAndRelaunch = useCallback(async () => {
    if (installingRef.current) return;

    let update = updateRef.current;
    let info = infoRef.current;
    if (!update || !info) {
      await runCheck();
      update = updateRef.current;
      info = infoRef.current;
    }
    if (!update || !info) return;

    installingRef.current = true;
    analytics.track("update_accepted", {
      from_version: info.currentVersion,
      to_version: info.version,
    });
    try {
      appPathRef.current = await osCurrentAppBundlePath();
      let totalLength = 0;
      let downloaded = 0;

      setStatus({ state: "downloading", info, progress: null });
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          totalLength = event.data.contentLength ?? 0;
          downloaded = 0;
          setStatus({ state: "downloading", info, progress: null });
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          const progress = totalLength > 0
            ? Math.min(100, Math.round((downloaded / totalLength) * 100))
            : null;
          setStatus({ state: "downloading", info, progress });
        } else if (event.event === "Finished") {
          setStatus({ state: "downloading", info, progress: 100 });
        }
      });

      setStatus({ state: "ready", info });
    } catch (error) {
      console.error("[updater] install failed", error);
      setStatus({ state: "error", info, phase: "install" });
      return;
    } finally {
      installingRef.current = false;
    }

    await relaunchInstalledApp();
  }, [relaunchInstalledApp, runCheck]);

  useEffect(() => {
    runCheck();
    intervalRef.current = setInterval(runCheck, CHECK_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [runCheck]);

  return { status, installAndRelaunch, relaunchInstalledApp };
}
