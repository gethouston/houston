import { useEffect, useRef } from "react";
import { useTeams } from "../../hooks/use-teams";
import { analytics } from "../../lib/analytics";
import { blockedTeamView } from "../../lib/teams-model";
import {
  blockedTopLevelView,
  DASHBOARD_VIEW_ID,
  isTopLevelView,
} from "../../lib/top-level-views";
import { useAgentStore } from "../../stores/agents";
import { useUIStore } from "../../stores/ui";

/**
 * The three standing rules of the shell's frame, kept out of its layout.
 *
 * 1. **The open view must exist.** Every screen is a top-level view now, so a
 *    `viewMode` no screen answers to, a view this caller's role hides (the AI
 *    Models hub for a plain member), or a team that stopped existing under an
 *    open team view all fall through every render branch and strand the user on
 *    a blank card. Each resets to Mission Control.
 * 2. **Something is always current.** `currentAgent` no longer picks a SCREEN,
 *    but provider routing, model prefs and the palette still read it, so the
 *    first agent adopts it when nothing has.
 * 3. **One `tab_opened` point.** Watching `viewMode` catches every path that
 *    changes it — rail click, shortcut, programmatic redirect — and fires on
 *    real transitions only, never on the first landing (`install_created`
 *    already records that).
 */
export function useWorkspaceViewGuards(showAiModels: boolean): void {
  const viewMode = useUIStore((s) => s.viewMode);
  const setViewMode = useUIStore((s) => s.setViewMode);
  const activeTeamId = useUIStore((s) => s.activeTeamId);
  const teams = useTeams();
  const currentAgent = useAgentStore((s) => s.current);
  const agents = useAgentStore((s) => s.agents);
  const setCurrentAgent = useAgentStore((s) => s.setCurrent);

  useEffect(() => {
    if (
      !isTopLevelView(viewMode) ||
      blockedTopLevelView(viewMode, { showAiModels }) ||
      blockedTeamView(viewMode, teams, activeTeamId)
    ) {
      setViewMode(DASHBOARD_VIEW_ID);
    }
  }, [activeTeamId, setViewMode, showAiModels, teams, viewMode]);

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
    // Settings emits its OWN event (`settings` for the index, `settings:<id>`
    // for a section) once the surface really renders. Emitting here too would
    // double-count every deep link and would fire while a gate still shows a
    // spinner, so the one view that owns its event is skipped.
    if (viewMode === "settings") return;
    analytics.track("tab_opened", { tab_name: viewMode });
  }, [viewMode]);
}
