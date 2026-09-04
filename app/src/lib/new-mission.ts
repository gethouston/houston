import { useAgentStore } from "../stores/agents.ts";
import { useUIStore } from "../stores/ui.ts";
import { currentTeams } from "./current-teams.ts";
import { openHome } from "./home-nav.ts";
import { openMissionChat } from "./mission-chat.ts";
import type { NewMissionScope } from "./new-mission-scope.ts";
import { openAgentBoard } from "./open-agent.ts";
import { teamById } from "./teams-model.ts";
import { isMissionBoardView } from "./top-level-views.ts";
import type { Agent } from "./types.ts";
import { isMobileViewport } from "./viewport.ts";

/**
 * Start a new mission from ANYWHERE: the ⌘N shortcut and the phone nav bar's
 * compose button share this one rule, so the two can never land differently.
 *
 * A team view is already showing the cross-agent board that owns the handler
 * (every board belongs to a team now): open its picker where the user is. The
 * guard is two-part because the `team` view also renders Team Settings,
 * Routines, Files and the no-agents empty state, none of which mounts a board
 * — with no registered handler the request has to fall through to the
 * navigate-then-fire path instead of silently doing nothing.
 *
 * Deliberately the VIEW-level predicate, not `isMissionBoardSurface` like the
 * arrow and Enter keys in `board-keys.ts`. This action has somewhere honest to
 * go when no board is on the glass (navigate to the board that owns the
 * handler, then fire), so a team's Routines section should fall through to
 * that path rather than be excluded. The arrows and Enter have no such
 * fallback, which is why they must not claim the key on a non-board section.
 * The asymmetry is the point.
 *
 * Anywhere else: go to the board that owns the handler — the team board of the
 * agent the user last worked with — and fire once it has registered. With no
 * agent to name one (a fresh space, or an agent the last space switch dropped)
 * the fallback is home, the first team's Mission Control, whose board
 * registers the same handler. Doing nothing here instead would be an
 * affordance that silently fails.
 *
 * `scope` is the phone's context (`lib/new-mission-scope.ts`) and is
 * deliberately DESKTOP-INERT: the desktop composes into whichever board is on
 * the glass, which already carries the same context.
 */
export function startNewMission(
  scope: NewMissionScope = { kind: "home" },
): void {
  // The phone fork, before any board handler: composing on the phone is the
  // agent picker sheet into an empty draft CHAT push (`lib/mission-chat.ts`),
  // never the desktop board's side composer. One agent skips the question.
  if (isMobileViewport()) {
    if (composeScoped(scope)) return;
    composeOverWholeRoster();
    return;
  }
  const ui = useUIStore.getState();
  const fire = () => useUIStore.getState().onStartMission?.();
  if (isMissionBoardView(ui.viewMode) && ui.onStartMission) {
    fire();
    return;
  }
  const { current, agents } = useAgentStore.getState();
  if (current && agents.length > 0) openAgentBoard(current.id);
  else openHome();
  setTimeout(fire, 50);
}

/**
 * The scoped phone compose, or `false` when the scope named nothing usable —
 * a deleted agent or an emptied team falls through to the roster-wide
 * question rather than dead-ending on a stale id.
 */
function composeScoped(scope: NewMissionScope): boolean {
  if (scope.kind === "agent") {
    const agent = useAgentStore
      .getState()
      .agents.find((a) => a.id === scope.agentId);
    if (!agent) return false;
    openMissionChat(agent, null);
    return true;
  }
  if (scope.kind === "team") {
    const roster = teamById(currentTeams(), scope.teamId)?.agents ?? [];
    if (roster.length === 0) return false;
    askRoster(
      roster,
      roster.map((a) => a.id),
    );
    return true;
  }
  return false;
}

/** The unscoped compose: the whole workspace roster, or home when it holds
 *  no agents at all — the one teamless fallback every nav shares. */
function composeOverWholeRoster(): void {
  const { agents } = useAgentStore.getState();
  if (agents.length === 0) {
    openHome();
    return;
  }
  askRoster(agents, undefined);
}

/** One agent skips the question; several open the picker sheet, narrowed to
 *  `scopeIds` when the caller had a shortlist (`undefined` = everyone). */
function askRoster(roster: Agent[], scopeIds: string[] | undefined): void {
  if (roster.length === 1) {
    openMissionChat(roster[0], null);
    return;
  }
  useUIStore.getState().setNewMissionSheetOpen(true, scopeIds);
}
