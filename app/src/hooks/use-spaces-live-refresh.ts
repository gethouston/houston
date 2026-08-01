import { useEffect } from "react";
import { useWorkspaceStore } from "../stores/workspaces";
import { useCapabilities } from "./use-capabilities";

/**
 * Keeps the space list live while the app is open (C8 spaces): a user who is
 * added to a team must see it appear without relaunching Houston — the
 * member-added email says "pick it from the workspace switcher", so the
 * switcher has to be current by the time they look.
 *
 * Why polling: the gateway's /v1/events hub is per-replica (an event emitted
 * on the replica that handled the member-add would miss a subscriber connected
 * to the other one), so there is no reliable membership push today. A quiet
 * re-list on window focus (the "read the email → switch back to Houston"
 * moment) plus a slow interval covers both the foreground and the left-open
 * cases without any spinner or toast: `refreshWorkspaces` never flips
 * `loading` and its failures are log-only.
 *
 * Gated on `capabilities.spaces` — the deployment says whether spaces exist;
 * single-player hosts never poll.
 */
const SPACES_REFRESH_INTERVAL_MS = 60_000;

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
