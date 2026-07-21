import { useCallback, useEffect, useRef, useState } from "react";
import type {
  InstallSource,
  UpdateInfo,
  UpdateStatus,
} from "../../hooks/use-update-machine";
import type { ForcedUpdateMode } from "../../lib/update-force";

/**
 * DEV-ONLY preview harness for the forced-update dialog (the sentry-smoke
 * idiom: gated on `import.meta.env.DEV`, so release builds tree-shake it).
 * The real flow only runs in packaged PROD builds against the live release
 * feed; this drives the same `UpdateForced` component with simulated status
 * from the DevTools console:
 *
 *   __HOUSTON_UPDATE_PREVIEW__("countdown")  mid-session dialog, live timer
 *   __HOUSTON_UPDATE_PREVIEW__("launch")     launch overlay, auto-"installs"
 *   __HOUSTON_UPDATE_PREVIEW__("error")      failed-install state
 *   __HOUSTON_UPDATE_PREVIEW__(null)         close the preview
 *
 * "Update now" / countdown expiry run a fake progress ramp to "ready";
 * nothing downloads and the relaunch button just closes the preview.
 * English-only by design — it's for us, never a real user.
 */

type PreviewStatus = Exclude<UpdateStatus, { state: "idle" }>;

export interface ForcedUpdatePreview {
  mode: ForcedUpdateMode;
  status: PreviewStatus;
  notes: string | null;
  onInstall: (source: InstallSource) => void;
  onRelaunch: () => void;
}

declare global {
  interface Window {
    __HOUSTON_UPDATE_PREVIEW__?: (
      scene: ForcedUpdateMode | "error" | null,
    ) => void;
  }
}

const PREVIEW_INFO: UpdateInfo = {
  currentVersion: "0.5.9",
  version: "0.6.0",
  body: null,
};

const PREVIEW_NOTES = [
  "**Forced-update preview** (dev harness, nothing downloads).",
  "- Progress is simulated; the auto-close after it is the stand-in for the real relaunch",
  "- `__HOUSTON_UPDATE_PREVIEW__(null)` closes it",
].join("\n");

export function useUpdateForcedPreview(): ForcedUpdatePreview | null {
  const [scene, setScene] = useState<{
    mode: ForcedUpdateMode;
    status: PreviewStatus;
  } | null>(null);
  const rampRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const delayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTimers = useCallback(() => {
    if (rampRef.current) clearInterval(rampRef.current);
    if (delayRef.current) clearTimeout(delayRef.current);
    rampRef.current = null;
    delayRef.current = null;
  }, []);

  const simulateInstall = useCallback(
    (mode: ForcedUpdateMode) => {
      stopTimers();
      let progress = 0;
      setScene({
        mode,
        status: { state: "downloading", info: PREVIEW_INFO, progress: null },
      });
      rampRef.current = setInterval(() => {
        progress += 4;
        if (progress >= 100) {
          stopTimers();
          setScene({ mode, status: { state: "ready", info: PREVIEW_INFO } });
          // The real flow relaunches into the new version by itself right
          // after the install; mirror that by closing the preview.
          delayRef.current = setTimeout(() => setScene(null), 1500);
          return;
        }
        setScene({
          mode,
          status: { state: "downloading", info: PREVIEW_INFO, progress },
        });
      }, 120);
    },
    [stopTimers],
  );

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    window.__HOUSTON_UPDATE_PREVIEW__ = (scene) => {
      stopTimers();
      if (scene === null) {
        setScene(null);
        return;
      }
      if (scene === "error") {
        setScene({
          mode: "countdown",
          status: { state: "error", info: PREVIEW_INFO, phase: "install" },
        });
        return;
      }
      setScene({
        mode: scene,
        status: {
          state: "available",
          info: PREVIEW_INFO,
          origin: scene === "launch" ? "launch" : "poll",
        },
      });
      // The real launch flow auto-installs; mirror it after a beat so the
      // overlay's resting state is visible before progress takes over.
      if (scene === "launch") {
        delayRef.current = setTimeout(() => simulateInstall("launch"), 1500);
      }
    };
    return () => {
      stopTimers();
      delete window.__HOUSTON_UPDATE_PREVIEW__;
    };
  }, [simulateInstall, stopTimers]);

  if (!scene) return null;
  return {
    ...scene,
    notes: PREVIEW_NOTES,
    onInstall: () => simulateInstall(scene.mode),
    onRelaunch: () => {
      stopTimers();
      setScene(null);
    },
  };
}
