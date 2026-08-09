import { useEffect } from "react";
import { flatSidebarOrder } from "../lib/agent-order";
import { openHome } from "../lib/home-nav";
import { openAgentBoard } from "../lib/open-agent";
import { isTypingTarget, matchShortcut } from "../lib/shortcuts";
import { INBOX_VIEW_ID, isMissionBoardView } from "../lib/top-level-views";
import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspaces";
import { handleBoardKeys } from "./board-keys";
import { getCurrentSidebarLayout } from "./use-sidebar-layout";

/**
 * Global keyboard shortcut router. Mounted once at the shell level.
 * Each binding reads the latest store state from `getState()` so it
 * never holds stale closures, and skips the default firing when the
 * user is typing in an input / textarea / contentEditable element.
 *
 * Source of truth for the bindings themselves lives in lib/shortcuts. The
 * BARE keys the board and the shared chat panel own (arrows, Enter, Escape)
 * live in `board-keys.ts`, which this router defers to last.
 */
export function useKeyboardShortcuts() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Bare-key shortcuts (no ⌘/Ctrl) must yield to typing or they
      // steal characters / cursor motion from the composer. ⌘-modified
      // bindings are safe to fire from any focus.
      if (matchShortcut("cheatsheet", e)) {
        if (isTypingTarget(e)) return;
        e.preventDefault();
        useUIStore.getState().setCheatsheetOpen(true);
        return;
      }

      if (matchShortcut("palette", e)) {
        e.preventDefault();
        const ui = useUIStore.getState();
        ui.setPaletteOpen(!ui.paletteOpen);
        return;
      }

      if (matchShortcut("inbox", e)) {
        e.preventDefault();
        useUIStore.getState().setViewMode(INBOX_VIEW_ID);
        return;
      }

      if (matchShortcut("newMission", e)) {
        e.preventDefault();
        const ui = useUIStore.getState();
        const agents = useAgentStore.getState().agents;
        const fire = () => useUIStore.getState().onStartMission?.();
        // A team view is already showing the cross-agent board that owns the
        // handler (every board belongs to a team now): open its picker where
        // the user is. The guard is two-part because the `team` view also
        // renders Team Settings, Routines, Files and the no-agents empty state,
        // none of which mounts a board — with no registered handler the
        // shortcut has to fall through to the navigate-then-fire path instead
        // of silently doing nothing.
        //
        // Deliberately the VIEW-level predicate, not `isMissionBoardSurface`
        // like the arrow and Enter keys in `board-keys.ts`. This shortcut has
        // somewhere honest to go when no board is on the glass (navigate to
        // the board that owns the handler, then fire), so a team's Routines
        // section should fall through to that path rather than be excluded
        // from the shortcut. The arrows and Enter have no such fallback, which
        // is why they must not claim the key on a non-board section. The
        // asymmetry is the point.
        if (isMissionBoardView(ui.viewMode) && ui.onStartMission) {
          fire();
          return;
        }
        // Anywhere else: go to the board that owns the handler — the team board
        // of the agent the user last worked with — and fire once it has
        // registered. With no agent to name one (a fresh space, or an agent the
        // last space switch dropped) the fallback is home, the first team's
        // Mission Control, whose board registers the same handler. Doing
        // nothing here instead would be a shortcut that silently fails.
        const current = useAgentStore.getState().current;
        if (current && agents.length > 0) openAgentBoard(current.id);
        else openHome();
        setTimeout(fire, 50);
        return;
      }

      if (matchShortcut("prevAgent", e) || matchShortcut("nextAgent", e)) {
        e.preventDefault();
        const dir = matchShortcut("nextAgent", e) ? 1 : -1;
        const { agents, current, setCurrent } = useAgentStore.getState();
        if (agents.length === 0) return;
        const workspaceId = useWorkspaceStore.getState().current?.id;
        const ordered = flatSidebarOrder(
          agents,
          getCurrentSidebarLayout(workspaceId),
        );
        const idx = current
          ? ordered.findIndex((a) => a.id === current.id)
          : -1;
        const nextIdx =
          idx === -1
            ? dir === 1
              ? 0
              : ordered.length - 1
            : (idx + dir + ordered.length) % ordered.length;
        const next = ordered[nextIdx];
        setCurrent(next);
        // ⌘[ / ⌘] walk the rail's agents; each one's home is its team board,
        // filtered to it.
        openAgentBoard(next.id);
        return;
      }

      // The board and the shared chat panel own the bare keys (arrows, Enter,
      // Escape); they decide for themselves when to yield.
      if (handleBoardKeys(e)) return;
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
