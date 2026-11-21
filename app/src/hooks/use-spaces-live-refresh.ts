import { useEffect } from "react";
import { useWorkspaceStore } from "../stores/workspaces";
import { useCapabilities } from "./use-capabilities";

const SPACES_REFRESH_INTERVAL_MS = 5 * 60_000;

export function useSpacesLiveRefresh(): void {
  const { capabilities } = useCapabilities();
  const spacesOn = capabilities?.spaces === true;
  const refreshWorkspaces = useWorkspaceStore((s) => s.refreshWorkspaces);

  useEffect(() => {
    if (!spacesOn) return;
    const refresh = () => void refreshWorkspaces();
    window.addEventListener("focus", refresh);
    const interval = setInterval(refresh, SPACES_REFRESH_INTERVAL_MS);
    return () => {
      window.removeEventListener("focus", refresh);
      clearInterval(interval);
    };
  }, [spacesOn, refreshWorkspaces]);
}
