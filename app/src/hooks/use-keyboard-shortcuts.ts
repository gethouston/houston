import { useEffect } from "react";
import { useAgentStore } from "../stores/agents";
import { useAgentCatalogStore } from "../stores/agent-catalog";
import { useUIStore } from "../stores/ui";
import { orderAgents } from "../lib/agent-order";
import { isTypingTarget, matchShortcut } from "../lib/shortcuts";

/**
 * Global keyboard shortcut router. Mounted once at the shell level.
 * Each binding reads the latest store state from `getState()` so it
 * never holds stale closures, and skips the default firing when the
 * user is typing in an input / textarea / contentEditable element.
 *
 * Source of truth for the bindings themselves lives in lib/shortcuts.
 */
export function useKeyboardShortcuts() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Bare `?` is the only shortcut that yields to typing — it would
      // otherwise steal a literal `?` from the composer. Everything else
      // is ⌘-modified and safe to fire from any focus.
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

      if (matchShortcut("missionControl", e)) {
        e.preventDefault();
        useUIStore.getState().setViewMode("dashboard");
        return;
      }

      if (matchShortcut("newMission", e)) {
        e.preventDefault();
        const ui = useUIStore.getState();
        const agents = useAgentStore.getState().agents;
        const fire = () => useUIStore.getState().onStartMission?.();
        if (ui.viewMode === "dashboard") {
          fire();
          return;
        }
        // Per-agent path: ensure the activity tab is mounted (that's what
        // registers onStartMission), then fire after a tick.
        const current = useAgentStore.getState().current;
        if (current && agents.length > 0) {
          if (ui.viewMode !== "activity") {
            ui.setViewMode("activity");
            setTimeout(fire, 50);
          } else {
            fire();
          }
        }
        return;
      }

      if (matchShortcut("prevAgent", e) || matchShortcut("nextAgent", e)) {
        e.preventDefault();
        const dir = matchShortcut("nextAgent", e) ? 1 : -1;
        const { agents, current, setCurrent } = useAgentStore.getState();
        if (agents.length === 0) return;
        const ordered = orderAgents(agents);
        const idx = current ? ordered.findIndex((a) => a.id === current.id) : -1;
        const nextIdx = idx === -1
          ? (dir === 1 ? 0 : ordered.length - 1)
          : (idx + dir + ordered.length) % ordered.length;
        const next = ordered[nextIdx];
        setCurrent(next);
        const def = useAgentCatalogStore.getState().getById(next.configId);
        const tab = def?.config.defaultTab ?? def?.config.tabs[0]?.id ?? "activity";
        useUIStore.getState().setViewMode(tab);
        return;
      }

      const arrowDir: "up" | "down" | "left" | "right" | null =
        matchShortcut("boardUp", e) ? "up"
        : matchShortcut("boardDown", e) ? "down"
        : matchShortcut("boardLeft", e) ? "left"
        : matchShortcut("boardRight", e) ? "right"
        : null;
      if (arrowDir) {
        const ui = useUIStore.getState();
        // Only navigate when the user is already on a board view, and
        // never when a dialog (palette/cheatsheet) owns its own arrows.
        const onBoard = ui.viewMode === "dashboard" || ui.viewMode === "activity";
        if (!onBoard || ui.paletteOpen || ui.cheatsheetOpen) return;
        e.preventDefault();
        ui.onBoardNavigate?.(arrowDir);
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
