import type { ToastItem } from "../stores/ui.ts";
import type { TeamMoveSource, TeamMoveState } from "./move-team.ts";

/**
 * The toast a closed postscript failure leaves behind. Once the source
 * cleanup ran, the folder whose menu opens the move is gone from the sidebar,
 * so this is the only way back to Retry before the next launch resumes it.
 */
export function closedPostscriptFailureToast(
  state: TeamMoveState,
  source: TeamMoveSource,
  copy: { title: string; retry: string },
  reopen: (source: TeamMoveSource) => void,
): Omit<ToastItem, "id"> | null {
  if (state.step !== "postscriptFailed" || state.stage !== "switching")
    return null;
  return {
    title: copy.title,
    variant: "error",
    action: { label: copy.retry, onClick: () => reopen(source) },
  };
}
