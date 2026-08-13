import { useCallback } from "react";
import { openHome } from "../lib/home-nav";
import { useUIStore } from "../stores/ui";

/**
 * Run the guided setup on demand — the ONE composition behind every control
 * that offers it: the rail's help menu ("Guide me",
 * `shell/sidebar-footer.tsx`) and the Academy's setup chapter (Start /
 * Replay).
 *
 * The order is the whole point. The flow operates over the workspace shell, so
 * the store leaves for home BEFORE the flow is armed, or the overlay mounts
 * against whatever screen the user was standing on. `openHome()` is a
 * synchronous Zustand set like the two arming calls after it, so the overlay
 * finds the restored shell already in place.
 *
 * `firstRun` is dropped because this run was ASKED for: the first-run beats
 * belong to a user meeting Houston for the first time, not to one who reached
 * for the guide.
 */
export function useRunGuidedSetup(): () => void {
  const setInAppOnboardingActive = useUIStore(
    (s) => s.setInAppOnboardingActive,
  );
  return useCallback(() => {
    openHome();
    useUIStore.getState().setInAppOnboardingFirstRun(false);
    setInAppOnboardingActive(true);
  }, [setInAppOnboardingActive]);
}
