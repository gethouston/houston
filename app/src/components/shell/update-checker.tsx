import { useUpdateChecker } from "../../hooks/use-update-checker";
import { updatePresentation } from "../../lib/update-policy";
import { UpdateLaunchOverlay } from "./update-launch-overlay";
import { UpdatePill } from "./update-pill";
import { useUpdatePreview } from "./update-preview";

/**
 * Mounts the update policy and renders its one surface, chosen by where the
 * release was found: the launch overlay for a launch-check find (install
 * already running), the restart pill for a mid-session find once the
 * download has landed. A background download in flight, or one that failed
 * and will retry on the next check, shows nothing at all.
 */
export function UpdateChecker() {
  const { status, installAndRelaunch, relaunchInstalledApp } =
    useUpdateChecker();

  // Dev-only console harness (`__HOUSTON_UPDATE_PREVIEW__`); null in prod.
  const preview = useUpdatePreview();
  if (preview) return preview;

  if (status.state === "idle" || status.state === "available") return null;

  if (updatePresentation(status.info.origin) === "launch") {
    return (
      <UpdateLaunchOverlay
        status={status}
        onRetry={() => void installAndRelaunch("user")}
        onRelaunch={() => void relaunchInstalledApp()}
      />
    );
  }

  if (
    status.state === "downloading" ||
    (status.state === "error" && status.phase === "download")
  ) {
    return null;
  }

  return (
    <UpdatePill
      status={status}
      onInstall={() => void installAndRelaunch("user")}
      onRelaunch={() => void relaunchInstalledApp()}
    />
  );
}
