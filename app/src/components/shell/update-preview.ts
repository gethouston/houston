import { createElement, type ReactElement, useEffect, useState } from "react";
import { updatePresentation } from "../../lib/update-policy";
import type { UpdateInfo, UpdateStatus } from "../../lib/update-status";
import { UpdateLaunchOverlay } from "./update-launch-overlay";
import { UpdatePill, type UpdatePillStatus } from "./update-pill";

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

export function useUpdatePreview(collapsed = false): ReactElement | null {
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
  if (updatePresentation(status) === "launch") {
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
    collapsed,
    status: status as UpdatePillStatus,
    onInstall: restart,
    onRelaunch: restart,
  });
}
