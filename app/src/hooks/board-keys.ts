/**
 * The keys the MISSION BOARD and the shared chat panel own: the four arrows,
 * bare Enter, and Escape. Split out of `use-keyboard-shortcuts.ts`, which keeps
 * the ⌘-modified global bindings.
 *
 * All three are BARE keys, so unlike the ⌘ bindings they must hand the
 * keystroke back the moment they are not the right owner — off a board there
 * is no card to open and no highlight to move, and swallowing the key would
 * keep it from the control the user has focused. They gate on
 * `isMissionBoardSurface` (what is on the GLASS), never on
 * `isMissionBoardView`: the asymmetry with ⌘N and the
 * palette, which DO have a navigate-then-fire fallback, is deliberate and
 * documented in `knowledge-base/board-shell.md`.
 */

import {
  isEmptyEditable,
  isTypingTarget,
  matchShortcut,
} from "../lib/shortcuts";
import { isMissionBoardSurface } from "../lib/top-level-views";
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

type ArrowDir = "up" | "down" | "left" | "right";

function arrowDirection(e: KeyboardEvent): ArrowDir | null {
  if (matchShortcut("boardUp", e)) return "up";
  if (matchShortcut("boardDown", e)) return "down";
  if (matchShortcut("boardLeft", e)) return "left";
  if (matchShortcut("boardRight", e)) return "right";
  return null;
}

function handleArrow(e: KeyboardEvent, dir: ArrowDir): void {
  const ui = useUIStore.getState();
  // Chat panel is open → arrows are a chat-reading affordance,
  // BUT only when focus is in the composer or outside any
  // editable. A different editable (e.g. the board toolbar's
  // search input) keeps its own cursor motion.
  if (ui.missionPanelOpen) {
    if (isTypingTarget(e)) {
      if (!isComposerFocused()) return;
      if (!isEmptyEditable(e)) return;
    }
    if (dir !== "up" && dir !== "down") return;
    if (scrollChatLog(dir)) e.preventDefault();
    return;
  }
  // Board view → arrows move the highlight. They do NOT open the panel; Enter
  // does that. Yield to any editable so search inputs etc. keep their cursor
  // motion. "Board" is a team's Mission Control — the SURFACE, not the view: a
  // team's Routines, Files or Settings section has no highlight to move, so it
  // must leave the arrow key alone instead of preventing the page's own
  // scrolling.
  if (isTypingTarget(e)) return;
  if (!isMissionBoardSurface(ui) || ui.paletteOpen || ui.cheatsheetOpen) return;
  e.preventDefault();
  ui.onBoardNavigate?.(dir);
}

function handleBoardOpen(e: KeyboardEvent): void {
  // Bare Enter opens the highlighted card. Yield to typing so
  // the composer's own Enter-to-send keeps working.
  if (isTypingTarget(e)) return;
  const ui = useUIStore.getState();
  if (ui.missionPanelOpen || ui.paletteOpen || ui.cheatsheetOpen) return;
  // A team's Mission Control. Off a board there is no card to open, and
  // swallowing Enter would keep it from reaching the control the user has
  // focused on Routines, Files or Team Settings.
  if (!isMissionBoardSurface(ui)) return;
  e.preventDefault();
  ui.onBoardOpen?.();
}

function isBareEscape(e: KeyboardEvent): boolean {
  return (
    e.key === "Escape" && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
  );
}

function handleEscape(e: KeyboardEvent): void {
  // chat-input stops streaming on Escape with preventDefault; if
  // that already ran, don't also collapse the panel.
  if (e.defaultPrevented) return;
  const ui = useUIStore.getState();
  if (!ui.missionPanelOpen) return;
  if (isComposerFocused()) {
    // First Escape: leave the composer so arrows scroll the
    // chat log and a second Escape can close the panel.
    const active = document.activeElement as HTMLElement | null;
    const log = document.querySelector('[role="log"]') as HTMLElement | null;
    active?.blur();
    log?.focus();
    e.preventDefault();
    return;
  }
  // Second Escape (or any Escape when the composer isn't focused):
  // close the chat panel entirely.
  e.preventDefault();
  ui.onPanelClose?.();
}

/**
 * Whether this keystroke is one of the board / panel keys. `true` means the
 * router stops here, whether or not the key ended up doing something: the
 * decision to yield is part of these handlers, not of the caller.
 */
export function handleBoardKeys(e: KeyboardEvent): boolean {
  const dir = arrowDirection(e);
  if (dir) {
    handleArrow(e, dir);
    return true;
  }
  if (matchShortcut("boardOpen", e)) {
    handleBoardOpen(e);
    return true;
  }
  if (isBareEscape(e)) {
    handleEscape(e);
    return true;
  }
  return false;
}
