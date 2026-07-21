import { check } from "@tauri-apps/plugin-updater";
import { useCallback, useEffect, useRef, useState } from "react";
import { analytics } from "../lib/analytics";
import {
  osCurrentAppBundlePath,
  osRelaunchAppFromPath,
} from "../lib/os-bridge";
import type { UpdateOrigin } from "../lib/update-force";

export interface UpdateInfo {
  currentVersion: string;
  version: string;
  body: string | null;
}

type UpdateErrorPhase = "install" | "relaunch";

/** What set the install off — the funnel needs to tell a click from the
 *  countdown expiring from the silent launch-time install. */
export type InstallSource = "user" | "countdown" | "launch";

export type UpdateStatus =
  | { state: "idle" }
  | { state: "available"; info: UpdateInfo; origin: UpdateOrigin }
  | { state: "downloading"; info: UpdateInfo; progress: number | null }
  | { state: "ready"; info: UpdateInfo }
  | { state: "error"; info: UpdateInfo; phase: UpdateErrorPhase };

type AvailableUpdate = NonNullable<Awaited<ReturnType<typeof check>>>;

/**
 * The updater state machine: check → available → downloading → ready →
 * relaunch (or error). Scheduling (when checks run) and policy (forcing the
 * install) live in `useUpdateChecker`; this hook only moves between states.
 */
export function useUpdateMachine() {
  const [status, setStatus] = useState<UpdateStatus>({ state: "idle" });
  const updateRef = useRef<AvailableUpdate | null>(null);
  const infoRef = useRef<UpdateInfo | null>(null);
  const statusRef = useRef<UpdateStatus>(status);
  const installingRef = useRef(false);
  const appPathRef = useRef<string | null>(null);
  const firstCheckRef = useRef(true);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const runCheck = useCallback(async () => {
    // The first check of a run is the launch check: a find there means the
    // user just opened the app and hasn't started working. Everything after
    // (interval, focus, 426 kick) is mid-session. The origin rides on the
    // available state so the policy layer can pick the forced presentation.
    const origin: UpdateOrigin = firstCheckRef.current ? "launch" : "poll";
    firstCheckRef.current = false;
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
      // recheck of the same version doesn't double-count.
      if (statusRef.current.state !== "available") {
        analytics.track("update_offered", {
          from_version: info.currentVersion,
          to_version: info.version,
        });
      }
      setStatus({ state: "available", info, origin });
    } catch (error) {
      console.warn("[updater] check failed", error);
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
      setStatus({ state: "error", info, phase: "relaunch" });
    }
  }, []);

  const installAndRelaunch = useCallback(
    async (source: InstallSource = "user") => {
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
        source,
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
            const progress =
              totalLength > 0
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
    },
    [relaunchInstalledApp, runCheck],
  );

  return { status, runCheck, installAndRelaunch, relaunchInstalledApp };
}
