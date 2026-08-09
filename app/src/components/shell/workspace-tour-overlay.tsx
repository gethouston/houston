import { useIsMobile } from "@houston-ai/core";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useCanCreateAgents } from "../../hooks/use-can-create-agents";
import { useCapabilities } from "../../hooks/use-capabilities";
import { useSurfaceGates } from "../../hooks/use-surface-gates";
import { useTeams } from "../../hooks/use-teams";
import { openHome } from "../../lib/home-nav";
import { openAgentSection } from "../../lib/open-agent";
import { homeTeam, teamOfAgent } from "../../lib/teams-model";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { UiTour } from "./ui-tour";
import { workspaceTourSteps } from "./workspace-tour";

/**
 * The guided tour, mounted over the shell. Rendered only while it is armed, so
 * every step measures against a shell that is already on screen.
 *
 * It teaches on the team holding the agent the user works with (the first team
 * in the rail when there is none), and it ENDS on that team's Routines section:
 * the freshly-seeded Morning briefing routine is the onboarding payoff, and it
 * is the last thing the user should be looking at. That landing applies whether
 * the tour completed or was skipped — `finishOnboarding` deliberately sets no
 * view of its own, because the tour's first step would overwrite it.
 */
export function WorkspaceTourOverlay() {
  const { t } = useTranslation(["agents", "dashboard", "shell", "board"]);
  const { capabilities } = useCapabilities();
  const { showAiModels } = useSurfaceGates();
  const { canCreate } = useCanCreateAgents();
  const isMobile = useIsMobile();
  const teams = useTeams();
  const currentAgent = useAgentStore((s) => s.current);
  const setUiTourActive = useUIStore((s) => s.setUiTourActive);

  // Most steps anchor on the rail, and the rail is collapsible (auto on a
  // narrow window, or by the toggle). Arming the tour expands it ONCE, here:
  // this overlay is the single thing both entry points mount, and a collapsed
  // rail would leave those steps measuring an element that does not exist.
  useEffect(() => {
    useUIStore.getState().setSidebarCollapsed(false);
  }, []);

  // The team the tour teaches on: the one holding the agent the user works
  // with, else HOME's team. Falling back through `homeTeam` (not just when
  // there is no current agent) is what makes `tourTeamId === null` mean "this
  // workspace has no teams at all" — which is the fact the step list needs to
  // land its shell-only steps on home without reading the stores itself.
  const tourTeam =
    (currentAgent ? teamOfAgent(teams, currentAgent.id) : null) ??
    homeTeam(teams);
  const tourTeamId = tourTeam?.id ?? null;

  // `UiTour` re-runs a step's `onEnter` whenever the step OBJECT changes, so a
  // rebuilt array on unrelated store churn would yank the user's view mid-step.
  const steps = useMemo(
    () =>
      workspaceTourSteps({
        t,
        capabilities,
        showAiModels,
        tourTeamId,
        canCreateAgents: canCreate,
        isMobile,
      }),
    [t, capabilities, showAiModels, tourTeamId, canCreate, isMobile],
  );

  return (
    <UiTour
      steps={steps}
      onDismiss={() => {
        setUiTourActive(false);
        if (currentAgent) openAgentSection(currentAgent.id, "routines");
        else openHome();
      }}
    />
  );
}
