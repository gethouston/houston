import type { TFunction } from "i18next";
import type { TeamSectionId } from "../../lib/teams-model.ts";
import { INBOX_VIEW_ID } from "../../lib/top-level-views.ts";
import { useUIStore } from "../../stores/ui.ts";
import { INTEGRATIONS_VIEW_ID } from "../integrations-view/id.ts";
import { SKILLS_VIEW_ID } from "../skills-view/id.ts";
import { STORE_VIEW_ID } from "../store-view/id.ts";
import type { UiTourStep } from "./ui-tour.tsx";
import {
  isStepAvailable,
  type TourStepGates,
  tourSelector,
} from "./workspace-tour-steps.ts";

export interface WorkspaceTourArgs extends TourStepGates {
  t: TFunction<["agents", "dashboard", "shell", "board"]>;
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
 * It walks the ONE path the product now has: your teams in the rail → a
 * team's Mission Control → starting a mission → what the team keeps running
 * on its own (the seeded Morning briefing, the onboarding payoff) → the
 * app-level destinations, which now open on the Inbox. There is no global
 * Mission Control to walk through any more (every board belongs to a team),
 * and no agent tab strip either. The rail names TEAMS and nothing else, so the
 * steps that teach a team's sections spotlight the team's screen, which is
 * where those sections live.
 *
 * Each step OPENS its destination on enter, so the spotlight always sits over
 * the real surface rather than over a trigger. Steps whose anchor a given
 * caller never renders are filtered out here (`isStepAvailable`), so the tour
 * can never spotlight nothing.
 */
export function workspaceTourSteps({
  t,
  tourTeamId,
  ...gates
}: WorkspaceTourArgs): UiTourStep[] {
  const setViewMode = useUIStore.getState().setViewMode;
  const openTeam = (section: TeamSectionId) => () => {
    // `tourTeamId === null` means the workspace resolved NO teams (the overlay
    // falls the tour's team back to `homeTeam`), so home is the Inbox — the
    // one screen that needs no team, exactly what `lib/home-nav.ts` lands on.
    if (tourTeamId === null) return setViewMode(INBOX_VIEW_ID);
    useUIStore.getState().openTeamView(tourTeamId, section);
  };
  // The steps that only need the SHELL on screen (they spotlight the rail, not
  // a surface) put the user on home rather than naming a view of their own.
  // Home is `openHome()`'s rule stated against the tour's own team: this module
  // is unit-tested by `node:test` and cannot pull in the store chain that the
  // store-free helper reads its teams from.
  const home = openTeam("mission-control");

  const steps: UiTourStep[] = [
    // Spaces hosts only: open on the switcher so people learn a Space holds
    // their personal agents and the teams they share with others.
    {
      title: t("shell:uiTour.steps.spaces.title"),
      body: t("shell:uiTour.steps.spaces.body"),
      targetSelector: tourSelector("spaceSwitcher"),
      onEnter: home,
    },
    {
      title: t("shell:uiTour.steps.teams.title"),
      body: t("shell:uiTour.steps.teams.body"),
      targetSelector: tourSelector("agents"),
      onEnter: home,
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
      targetSelector: tourSelector("main"),
      onEnter: openTeam("archived"),
    },
    // A team's sections are tabs on its own SCREEN now, not rows in the rail,
    // so these two spotlight the screen and let their `onEnter` put the right
    // section under it — the same anchor the board step uses, for the same
    // reason: the surface is the thing being taught.
    {
      title: t("shell:uiTour.steps.teamRoutines.title"),
      body: t("shell:uiTour.steps.teamRoutines.body"),
      targetSelector: tourSelector("main"),
      onEnter: openTeam("routines"),
    },
    {
      title: t("shell:uiTour.steps.teamFiles.title"),
      body: t("shell:uiTour.steps.teamFiles.body"),
      targetSelector: tourSelector("main"),
      onEnter: openTeam("files"),
    },
    // The app-level destinations open here, with the Inbox first: it is the one
    // screen that belongs to no team, so it heads the group rather than sitting
    // in the middle of the team story.
    {
      title: t("shell:uiTour.steps.inbox.title"),
      body: t("shell:uiTour.steps.inbox.body"),
      targetSelector: tourSelector("nav-inbox"),
      onEnter: () => setViewMode(INBOX_VIEW_ID),
    },
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
    // Settings is the PERSON's app now and nothing else: Admin is a rail row of
    // its own, Time worked is a lens inside it, and the Permissions screen is
    // gone (agent policy is discovered through a team's Manage agents). So
    // there is no second, team-shaped promise to make here and one body serves
    // every caller.
    {
      title: t("shell:uiTour.steps.settings.title"),
      body: t("shell:uiTour.steps.settings.body"),
      targetSelector: tourSelector("nav-settings"),
      onEnter: () => useUIStore.getState().openSettings(null),
    },
    {
      title: t("shell:uiTour.steps.newAgent.title"),
      body: t("shell:uiTour.steps.newAgent.body"),
      targetSelector: tourSelector("newAgent"),
      onEnter: home,
    },
    {
      title: t("shell:uiTour.steps.agentStore.title"),
      body: t("shell:uiTour.steps.agentStore.body"),
      targetSelector: tourSelector("nav-agent-store"),
      onEnter: () => setViewMode(STORE_VIEW_ID),
    },
    // The "replay the tour" step is a wrap-up pointer at the replay button, so
    // it comes last, right before the outro. "Guide me" lives behind the help
    // control in the rail's FOOTER now, so the anchor is on screen whatever is
    // open and the step names no view of its own: like every other
    // rail-anchored step it lands on home, which is both where the previous
    // step's store visit is left behind and where a replay would start.
    {
      title: t("shell:uiTour.steps.appTour.title"),
      body: t("shell:uiTour.steps.appTour.body"),
      targetSelector: tourSelector("appTour"),
      onEnter: home,
    },
    {
      title: t("shell:uiTour.steps.outro.title"),
      body: t("shell:uiTour.steps.outro.body"),
      confirmLabel: t("shell:uiTour.steps.outro.confirm"),
    },
  ];

  return steps.filter((step) => isStepAvailable(step.targetSelector, gates));
}
