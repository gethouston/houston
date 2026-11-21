import { useEffect } from "react";
import { analytics } from "../../lib/analytics";

const counted = new Set<string>();

export function useTrackFirstDayNeedsAi(
  needsAi: boolean,
  surface: "start_button" | "banner",
): void {
  useEffect(() => {
    if (!needsAi || counted.has(surface)) return;
    counted.add(surface);
    analytics.track("agent_first_day_needs_ai", { surface });
  }, [needsAi, surface]);
}
