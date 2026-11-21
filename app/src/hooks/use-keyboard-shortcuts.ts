import { useEffect } from "react";
import { flatSidebarOrder } from "../lib/agent-order";
import { startNewMission } from "../lib/new-mission";
import { openAgentBoard } from "../lib/open-agent";
import { isTypingTarget, matchShortcut } from "../lib/shortcuts";
import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";
import { useWorkspaceStore } from "../stores/workspaces";
import { handleBoardKeys } from "./board-keys";
import { getCurrentSidebarLayout } from "./use-sidebar-layout";

export function useKeyboardShortcuts() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
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

      if (matchShortcut("newMission", e)) {
        e.preventDefault();
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
        openAgentBoard(next.id);
        return;
      }

      if (handleBoardKeys(e)) return;
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
