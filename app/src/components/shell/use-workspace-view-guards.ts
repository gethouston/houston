import { useEffect, useRef } from "react";
import { useTeams } from "../../hooks/use-teams";
import { analytics } from "../../lib/analytics";
import { homeTeam } from "../../lib/teams-model";
import { INBOX_VIEW_ID } from "../../lib/top-level-views";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";
import { useWorkspaceStore } from "../../stores/workspaces";
import {
  bootGuardStep,
  deadViewStep,
  INITIAL_BOOT_GUARD,
} from "./view-guard-rules.ts";

/**
 * The four standing rules of the shell's frame, kept out of its layout. The
 * decisions behind rules 1 and 2 are pure functions in `view-guard-rules.ts`;
 * what lives here is the effect around them.
 *
 * 1. **Boot lands on the first team's Mission Control.** The store starts on
 *    the Inbox, the one screen that needs no team, so the first paint is
 *    honest while the teams are still resolving. The moment the first team
 *    lands, home is its Mission Control and that is where the user goes.
 *    One shot per
 *    workspace, re-armed on a workspace change (each space boots into its own
 *    first team), and dropped the moment the user navigates somewhere of their
 *    own during the read.
 * 2. **The open view must exist.** Every screen is a top-level view now, so a
 *    `viewMode` no screen answers to, a view this caller's gates hide (the AI
 *    Models hub for a plain member, Admin for anyone but an owner/admin of a
 *    team space), or a team
 *    that stopped existing under an open team view all fall through every render
 *    branch and strand the user on a blank card. Each goes home. Two cases WAIT
 *    instead, because they are in-flight rather than stale: a dead TEAM view in
 *    a workspace with no teams, and a gated view whose capabilities have not
 *    resolved yet.
 * 3. **Something is always current.** `currentAgent` no longer picks a SCREEN,
 *    but provider routing, model prefs and the palette still read it, so the
 *    first agent adopts it when nothing has.
 * 4. **One `tab_opened` point.** Watching `viewMode` catches every path that
 *    changes it — rail click, shortcut, programmatic redirect — and fires on
 *    real transitions only, never on the first landing (`install_created`
 *    already records that).
 */
export function useWorkspaceViewGuards(gates: {
  showAiModels: boolean;
  showOrganization: boolean;
  /** False while the capabilities behind the gates are still loading. */
  ready: boolean;
}): void {
  const { showAiModels, showOrganization, ready } = gates;
  const viewMode = useUIStore((s) => s.viewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const openTeamView = useUIStore((s) => s.openTeamView);
  const activeTeamId = useUIStore((s) => s.activeTeamId);
  const workspaceId = useWorkspaceStore((s) => s.current?.id);
  const teams = useTeams();
  const currentAgent = useAgentStore((s) => s.current);
  const agents = useAgentStore((s) => s.agents);
  const setCurrentAgent = useAgentStore((s) => s.setCurrent);

  const boot = useRef(INITIAL_BOOT_GUARD);
  useEffect(() => {
    const team = homeTeam(teams);
    const step = bootGuardStep(boot.current, {
      workspaceId: workspaceId ?? null,
      viewMode,
      hasHomeTeam: team !== null,
    });
    boot.current = step.state;
    if (step.action === "open-home-team" && team !== null) {
      openTeamView(team.id, "mission-control");
    }
  }, [openTeamView, teams, viewMode, workspaceId]);

  useEffect(() => {
    // `homeTeam` directly rather than `openHome()`: this hook already holds the
    // resolved teams, and going through the store-free helper would resolve
    // them a second time.
    const action = deadViewStep({
      viewMode,
      showAiModels,
      showOrganization,
      gatesReady: ready,
      teams,
      activeTeamId,
    });
    if (action !== "go-home") return;
    const team = homeTeam(teams);
    if (team === null) setViewMode(INBOX_VIEW_ID);
    else openTeamView(team.id, "mission-control");
  }, [
    activeTeamId,
    openTeamView,
    ready,
    setViewMode,
    showAiModels,
    showOrganization,
    teams,
    viewMode,
  ]);

  useEffect(() => {
    if (!currentAgent && agents.length > 0) setCurrentAgent(agents[0]);
  }, [agents, currentAgent, setCurrentAgent]);

  const lastTracked = useRef<string | null>(null);
  useEffect(() => {
    if (lastTracked.current === null) {
      lastTracked.current = viewMode;
      return;
    }
    if (lastTracked.current === viewMode) return;
    lastTracked.current = viewMode;
    // Settings emits its OWN top-level event (`settings` for the index,
    // `settings:<id>` for a section) once the surface really renders. Emitting
    // here too would double-count every deep link, so the one view that owns
    // its event is skipped.
    //
    // Admin is NOT skipped: this is its only top-level event. What it tracks
    // itself is strictly a DRILL-IN — an Admin section detail
    // (`org:<section>`) — which fires on a narrower transition, never on
    // landing, so the pair reads as one view event plus its sub-navigation.
    if (viewMode === "settings") return;
    analytics.track("tab_opened", { tab_name: viewMode });
  }, [viewMode]);
}
