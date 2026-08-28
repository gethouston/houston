import { useEffect } from "react";
import { flatSidebarOrder } from "../lib/agent-order";
import { startNewMission } from "../lib/new-mission";
import { openAgentBoard } from "../lib/open-agent";
import { isTypingTarget, matchShortcut } from "../lib/shortcuts";
import { INBOX_VIEW_ID } from "../lib/top-level-views";
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
        // Fire-on-the-board or navigate-then-fire: the rule lives in
        // `lib/new-mission.ts`, shared with the mobile top bar's compose
        // button so the two can never land differently.
        startNewMission();
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
