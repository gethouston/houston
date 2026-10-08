import { useEffect } from "react";
import { logAndReportError } from "../lib/error-report";
import { tauriPush } from "../lib/tauri";
import { useWorkspaceStore } from "../stores/workspaces";
import { useCapabilities } from "./use-capabilities";

export function usePushPresence(signedIn: boolean): void {
  const { capabilities } = useCapabilities();
  const workspaceId = useWorkspaceStore((state) => state.current?.id);
  useEffect(() => {
    if (
      !signedIn ||
      !workspaceId ||
      capabilities?.profile !== "cloud" ||
      !capabilities.push
    )
      return;
    return tauriPush.startPresence(
      () => document.visibilityState === "visible" && document.hasFocus(),
      (error) => logAndReportError("push_presence", error),
    );
  }, [signedIn, capabilities?.profile, capabilities?.push, workspaceId]);
}
