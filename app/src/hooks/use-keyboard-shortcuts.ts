import { useEffect } from "react";
import { DEFAULT_TAB_ID } from "../agents/standard-tabs";
import { orderAgents } from "../lib/agent-order";
import {
  isEmptyEditable,
  isTypingTarget,
  matchShortcut,
} from "../lib/shortcuts";
import { useAgentStore } from "../stores/agents";
import { useUIStore } from "../stores/ui";

/**
 * Programmatic step-scroll of the chat message log. The conversation
 * has two nested divs: the outer carries role="log" (focus target on
 * Escape) but use-stick-to-bottom drives a SEPARATE inner pane as its
 * actual scroll container — outer's content exactly fills outer, so
 * scrollBy on outer is a no-op. We target the inner pane by its
 * stable marker class. The lib's "escapedFromLock" tracker picks the
 * scrollTop change up and stops auto-following the bottom while the
 * user reads.
 */
function scrollChatLog(dir: "up" | "down"): boolean {
  const pane = document.querySelector(
    ".conversation-scroll-pane",
  ) as HTMLElement | null;
  if (!pane) return false;
  const step = Math.max(60, pane.clientHeight * 0.4);
  pane.scrollBy({ top: dir === "down" ? step : -step, behavior: "smooth" });
  return true;
}

/** True when document.activeElement is the chat composer textarea. */
function isComposerFocused(): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (!active) return false;
  if (active.tagName !== "TEXTAREA") return false;
  return active.getAttribute("name") === "message";
}

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
        useUIStore.getState().setViewMode(DEFAULT_TAB_ID);
        return;
      }

      const arrowDir: "up" | "down" | "left" | "right" | null = matchShortcut(
        "boardUp",
        e,
      )
        ? "up"
        : matchShortcut("boardDown", e)
          ? "down"
          : matchShortcut("boardLeft", e)
            ? "left"
            : matchShortcut("boardRight", e)
              ? "right"
              : null;
      if (arrowDir) {
        const ui = useUIStore.getState();
        // Chat panel is open → arrows are a chat-reading affordance,
        // BUT only when focus is in the composer or outside any
        // editable. A different editable (e.g. the search input in
        // the tab bar) keeps its own cursor motion.
        if (ui.missionPanelOpen) {
          if (isTypingTarget(e)) {
            if (!isComposerFocused()) return;
            if (!isEmptyEditable(e)) return;
          }
          if (arrowDir !== "up" && arrowDir !== "down") return;
          if (scrollChatLog(arrowDir)) e.preventDefault();
          return;
        }
        // Board view → arrows move the highlight. They do NOT open
        // the panel; Enter does that. Yield to any editable so
        // search inputs etc. keep their cursor motion.
        if (isTypingTarget(e)) return;
        const onBoard =
          ui.viewMode === "dashboard" || ui.viewMode === "activity";
        if (!onBoard || ui.paletteOpen || ui.cheatsheetOpen) return;
        e.preventDefault();
        ui.onBoardNavigate?.(arrowDir);
        return;
      }

      if (matchShortcut("boardOpen", e)) {
        // Bare Enter opens the highlighted card. Yield to typing so
        // the composer's own Enter-to-send keeps working.
        if (isTypingTarget(e)) return;
        const ui = useUIStore.getState();
        if (ui.missionPanelOpen || ui.paletteOpen || ui.cheatsheetOpen) return;
        const onBoard =
          ui.viewMode === "dashboard" || ui.viewMode === "activity";
        if (!onBoard) return;
        e.preventDefault();
        ui.onBoardOpen?.();
        return;
      }

      if (
        e.key === "Escape" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.shiftKey &&
        !e.altKey
      ) {
        // chat-input stops streaming on Escape with preventDefault; if
        // that already ran, don't also collapse the panel.
        if (e.defaultPrevented) return;
        const ui = useUIStore.getState();
        if (!ui.missionPanelOpen) return;
        if (isComposerFocused()) {
          // First Escape: leave the composer so arrows scroll the
          // chat log and a second Escape can close the panel.
          const active = document.activeElement as HTMLElement | null;
          const log = document.querySelector(
            '[role="log"]',
          ) as HTMLElement | null;
          active?.blur();
          log?.focus();
          e.preventDefault();
          return;
        }
        // Second Escape (or any Escape when the composer isn't focused):
        // close the chat panel entirely.
        e.preventDefault();
        ui.onPanelClose?.();
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
