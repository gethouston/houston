import { createElement, type ReactElement, useEffect, useState } from "react";
import type { UpdateInfo, UpdateStatus } from "../../lib/update-status";
import { UpdateLaunchOverlay } from "./update-launch-overlay";
import { UpdatePill, type UpdatePillStatus } from "./update-pill";

/**
 * DEV-ONLY preview harness for the update surfaces (the sentry-smoke idiom:
 * gated on `import.meta.env.DEV`, so release builds tree-shake it). The real
 * flow only runs in packaged PROD builds against the live release feed; this
 * drives the same components with simulated status from the DevTools
 * console:
 *
 *   __HOUSTON_UPDATE_PREVIEW__("launch")   launch overlay, progress ramps
 *   __HOUSTON_UPDATE_PREVIEW__("pill")     the restart pill, click "restarts"
 *   __HOUSTON_UPDATE_PREVIEW__("error")    the pill in its failed-install state
 *   __HOUSTON_UPDATE_PREVIEW__(null)       close the preview
 *
 * Nothing downloads; a click on the pill shows the restarting state for a
 * beat and closes. English-only by design: it's for us, never a real user.
 */

type PreviewScene = "launch" | "pill" | "error";

declare global {
  interface Window {
    __HOUSTON_UPDATE_PREVIEW__?: (scene: PreviewScene | null) => void;
  }
}

const LAUNCH_INFO: UpdateInfo = {
  currentVersion: "0.6.15",
  version: "0.6.16",
  origin: "launch",
};
const POLL_INFO: UpdateInfo = { ...LAUNCH_INFO, origin: "poll" };

export function useUpdatePreview(): ReactElement | null {
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    window.__HOUSTON_UPDATE_PREVIEW__ = (scene) => {
      stop();
      if (scene === null) return setStatus(null);
      if (scene === "pill")
        return setStatus({ state: "downloaded", info: POLL_INFO });
      if (scene === "error") {
        return setStatus({ state: "error", info: POLL_INFO, phase: "install" });
      }
      let progress = 0;
      setStatus({ state: "downloading", info: LAUNCH_INFO, progress: null });
      timer = setInterval(() => {
        progress += 4;
        if (progress < 100) {
          setStatus({ state: "downloading", info: LAUNCH_INFO, progress });
          return;
        }
        stop();
        setStatus({ state: "installing", info: LAUNCH_INFO });
        // The real flow relaunches by itself right after; mirror by closing.
        setTimeout(() => setStatus(null), 1500);
      }, 120);
    };
    return () => {
      stop();
      delete window.__HOUSTON_UPDATE_PREVIEW__;
    };
  }, []);

  if (!status || status.state === "idle" || status.state === "available") {
    return null;
  }
  if (status.info.origin === "launch") {
    return createElement(UpdateLaunchOverlay, {
      status,
      onRetry: () => setStatus(null),
      onRelaunch: () => setStatus(null),
    });
  }
  if (status.state === "downloading") return null;
  const restart = () => {
    setStatus({ state: "installing", info: POLL_INFO });
    setTimeout(() => setStatus(null), 1500);
  };
  return createElement(UpdatePill, {
    status: status as UpdatePillStatus,
    onInstall: restart,
    onRelaunch: restart,
  });
}
