import type { ToastItem } from "../stores/ui.ts";
import type { TeamMoveSource, TeamMoveState } from "./move-team.ts";

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
