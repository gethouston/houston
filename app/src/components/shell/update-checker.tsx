import { useUpdateChecker } from "../../hooks/use-update-checker";
import { updatePresentation } from "../../lib/update-policy";
import { UpdateLaunchOverlay } from "./update-launch-overlay";
import { UpdatePill } from "./update-pill";
import { useUpdatePreview } from "./update-preview";

export function UpdateChecker({ collapsed = false }: { collapsed?: boolean }) {
  const { status, installAndRelaunch, relaunchInstalledApp } =
    useUpdateChecker();

  const preview = useUpdatePreview(collapsed);
  if (preview) return preview;

  if (status.state === "idle" || status.state === "available") return null;

  if (updatePresentation(status) === "launch") {
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
      collapsed={collapsed}
      status={status}
      onInstall={() => void installAndRelaunch("user")}
      onRelaunch={() => void relaunchInstalledApp()}
    />
  );
}
