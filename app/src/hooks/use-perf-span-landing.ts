import { isMobileViewport } from "@houston-ai/core";
import { useLayoutEffect } from "react";
import type { BootLanding } from "../components/shell/view-guard-rules";
import { landingScreen } from "../lib/perf-span-board";
import { perfSpans } from "../lib/perf-spans";
import { useUIStore } from "../stores/ui";

/**
 * Reports the screen the shell first shows once its boot landing settles, so
 * `app_to_board` knows whether the board was that screen. A layout effect:
 * the board's paint mark runs in a passive effect of the same commit, and
 * the landing has to be in by then.
 */
export function usePerfSpanLanding(landing: BootLanding): void {
  const done = landing.kind === "done";
  useLayoutEffect(() => {
    if (done)
      perfSpans.landedOn(
        landingScreen(useUIStore.getState(), isMobileViewport()),
      );
  }, [done]);
}
