import { useAgentStore } from "../stores/agents.ts";
import { useUIStore } from "../stores/ui.ts";
import { openHome } from "./home-nav.ts";
import { openMissionChat } from "./mission-chat.ts";
import { openAgentBoard } from "./open-agent.ts";
import { isMissionBoardView } from "./top-level-views.ts";
import { isMobileViewport } from "./viewport.ts";

/**
 * Start a new mission from ANYWHERE: the ⌘N shortcut and the mobile top bar's
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
 */
export function startNewMission(): void {
  // The phone fork, before any board handler: composing on the phone is the
  // agent picker sheet into an empty draft CHAT push (`lib/mission-chat.ts`),
  // never the desktop board's side composer. One agent skips the question.
  if (isMobileViewport()) {
    const { agents } = useAgentStore.getState();
    if (agents.length === 1) {
      openMissionChat(agents[0], null);
      return;
    }
    if (agents.length > 1) {
      useUIStore.getState().setNewMissionSheetOpen(true);
      return;
    }
    // No agents: the one teamless fallback every nav shares.
    openHome();
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
