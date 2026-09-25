import { useEffect, useRef, useState } from "react";
import { analytics } from "../../../lib/analytics";
import { TEAM_CHOICE, type TeamView, teamFunnelStep } from "./team-view-model";

export type TeamCardMode = "first_run" | "new_workspace";

/** How the incoming screen arrives: from the side the move travels. */
export type TeamMoveDirection = "forward" | "back";

export interface TeamNavigation {
  view: TeamView;
  direction: TeamMoveDirection;
  go: (next: TeamView) => void;
  back: (previous: TeamView) => void;
}

/**
 * Where the card stands, and the one side effect of standing there: in the
 * first-run flow, reaching the hire or the basic-team path is a step of the
 * onboarding funnel (`onboarding_step_viewed`), counted once per run like
 * every other step of it. A new workspace is not onboarding, so it reports
 * nothing.
 */
export function useTeamNavigation(mode: TeamCardMode): TeamNavigation {
  const [view, setView] = useState<TeamView>(TEAM_CHOICE);
  const [direction, setDirection] = useState<TeamMoveDirection>("forward");
  const reported = useRef(new Set<string>());

  const funnelStep = teamFunnelStep(view);
  useEffect(() => {
    if (mode !== "first_run" || funnelStep === null) return;
    if (reported.current.has(funnelStep)) return;
    reported.current.add(funnelStep);
    analytics.track("onboarding_step_viewed", { step: funnelStep });
  }, [mode, funnelStep]);

  return {
    view,
    direction,
    go: (next) => {
      setDirection("forward");
      setView(next);
    },
    back: (previous) => {
      setDirection("back");
      setView(previous);
    },
  };
}
