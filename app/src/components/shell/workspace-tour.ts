import type { TFunction } from "i18next";
import type { TeamSectionId } from "../../lib/teams-model.ts";
import { DASHBOARD_VIEW_ID } from "../../lib/top-level-views.ts";
import { useUIStore } from "../../stores/ui.ts";
import { INTEGRATIONS_VIEW_ID } from "../integrations-view/id.ts";
import { SKILLS_VIEW_ID } from "../skills-view/id.ts";
import { STORE_VIEW_ID } from "../store-view/id.ts";
import type { UiTourStep } from "./ui-tour.tsx";
import {
  isStepAvailable,
  sectionRowSelector,
  type TourStepGates,
  tourSelector,
} from "./workspace-tour-steps.ts";

export interface WorkspaceTourArgs extends TourStepGates {
  t: TFunction<["agents", "dashboard", "shell", "board"]>;
  /** Only a caller who HAS a team sees the Team card inside Settings. */
  showOrganization: boolean;
  /**
   * The team the tour teaches on — the one holding the agent the user is
   * working with, else the first team in the rail. `null` when the workspace
   * has no teams at all (no workspace resolved), which drops every step that
   * spotlights a team row.
   */
  tourTeamId: string | null;
}

/**
 * The guided tour, in the teams world.
 *
 * It walks the ONE path the product now has: your teams in the rail → a team's
 * Mission Control → starting a mission → what the team keeps running on its own
 * (the seeded Morning briefing, the onboarding payoff) → the app-level
 * destinations. There is no agent tab strip to walk any more, so the steps that
 * used to spotlight one tab each are gone; a team's section rows carry the same
 * ideas, in the rail where the user will look for them again.
 *
 * Each step OPENS its destination on enter, so the spotlight always sits over
 * the real surface rather than over a trigger. Steps whose anchor a given
 * caller never renders are filtered out here (`isStepAvailable`), so the tour
 * can never spotlight nothing.
 */
export function workspaceTourSteps({
  t,
  showOrganization,
  tourTeamId,
  ...gates
}: WorkspaceTourArgs): UiTourStep[] {
  const setViewMode = useUIStore.getState().setViewMode;
  const openTeam = (section: TeamSectionId) => () => {
    if (tourTeamId === null) return setViewMode(DASHBOARD_VIEW_ID);
    useUIStore.getState().openTeamView(tourTeamId, section);
  };
  const missionControl = () => setViewMode(DASHBOARD_VIEW_ID);

  const steps: UiTourStep[] = [
    // Spaces hosts only: open on the switcher so people learn a Space holds
    // their personal agents and the teams they share with others.
    {
      title: t("shell:uiTour.steps.spaces.title"),
      body: t("shell:uiTour.steps.spaces.body"),
      targetSelector: tourSelector("spaceSwitcher"),
      onEnter: missionControl,
    },
    {
      title: t("shell:uiTour.steps.teams.title"),
      body: t("shell:uiTour.steps.teams.body"),
      targetSelector: tourSelector("agents"),
      onEnter: missionControl,
    },
    {
      title: t("shell:uiTour.steps.missionControl.title"),
      body: t("shell:uiTour.steps.missionControl.body"),
      targetSelector: tourSelector("nav-dashboard"),
      onEnter: missionControl,
    },
    {
      title: t("shell:uiTour.steps.teamBoard.title"),
      body: t("shell:uiTour.steps.teamBoard.body"),
      targetSelector: tourSelector("main"),
      onEnter: openTeam("mission-control"),
    },
    {
      title: t("shell:uiTour.steps.newMission.title"),
      body: t("shell:uiTour.steps.newMission.body"),
      targetSelector: tourSelector("newMission"),
      onEnter: openTeam("mission-control"),
    },
    {
      title: t("shell:uiTour.steps.archivedMissions.title"),
      body: t("shell:uiTour.steps.archivedMissions.body"),
      targetSelector: tourSelector("archivedMissions"),
      onEnter: openTeam("mission-control"),
    },
    // Anchored on a team's section rows, so they only exist once a team does.
    ...(tourTeamId === null
      ? []
      : [
          {
            title: t("shell:uiTour.steps.teamRoutines.title"),
            body: t("shell:uiTour.steps.teamRoutines.body"),
            targetSelector: sectionRowSelector(tourTeamId, "routines"),
            onEnter: openTeam("routines"),
          },
          {
            title: t("shell:uiTour.steps.teamFiles.title"),
            body: t("shell:uiTour.steps.teamFiles.body"),
            targetSelector: sectionRowSelector(tourTeamId, "files"),
            onEnter: openTeam("files"),
          },
        ]),
    {
      title: t("shell:uiTour.steps.navIntegrations.title"),
      body: t("shell:uiTour.steps.navIntegrations.body"),
      targetSelector: tourSelector("nav-integrations"),
      onEnter: () => setViewMode(INTEGRATIONS_VIEW_ID),
    },
    {
      title: t("shell:uiTour.steps.navSkills.title"),
      body: t("shell:uiTour.steps.navSkills.body"),
      targetSelector: tourSelector("nav-skills"),
      onEnter: () => setViewMode(SKILLS_VIEW_ID),
    },
    {
      title: t("shell:uiTour.steps.aiHub.title"),
      body: t("shell:uiTour.steps.aiHub.body"),
      targetSelector: tourSelector("nav-ai-hub"),
      onEnter: () => setViewMode("ai-hub"),
    },
    // Usage, Permissions and Admin have no sidebar anchor to spotlight since
    // HOU-788 — they are sections inside Settings, which this step covers. It
    // only PROMISES them to a caller whose org gate is on: single-player and
    // plain members see no Team card, so their copy stops at personal settings.
    {
      title: t("shell:uiTour.steps.settings.title"),
      body: showOrganization
        ? t("shell:uiTour.steps.settings.bodyTeam")
        : t("shell:uiTour.steps.settings.body"),
      targetSelector: tourSelector("nav-settings"),
      onEnter: () => useUIStore.getState().openSettings(null),
    },
    {
      title: t("shell:uiTour.steps.newAgent.title"),
      body: t("shell:uiTour.steps.newAgent.body"),
      targetSelector: tourSelector("newAgent"),
      onEnter: missionControl,
    },
    {
      title: t("shell:uiTour.steps.agentStore.title"),
      body: t("shell:uiTour.steps.agentStore.body"),
      targetSelector: tourSelector("nav-agent-store"),
      onEnter: () => setViewMode(STORE_VIEW_ID),
    },
    // The "replay the tour" step is a wrap-up pointer at the replay button, so
    // it comes last, right before the outro. That entry point is the Settings >
    // Help row, so the step opens Settings for its anchor to exist.
    {
      title: t("shell:uiTour.steps.appTour.title"),
      body: t("shell:uiTour.steps.appTour.body"),
      targetSelector: tourSelector("appTour"),
      onEnter: () => useUIStore.getState().openSettings(null),
    },
    {
      title: t("shell:uiTour.steps.outro.title"),
      body: t("shell:uiTour.steps.outro.body"),
      confirmLabel: t("shell:uiTour.steps.outro.confirm"),
    },
  ];

  return steps.filter((step) => isStepAvailable(step.targetSelector, gates));
}
