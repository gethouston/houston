import {
  isEmptyEditable,
  isOverlayTarget,
  isTypingTarget,
  matchShortcut,
} from "../lib/shortcuts";
import { isMissionBoardSurface } from "../lib/top-level-views";
import { useUIStore } from "../stores/ui";

function scrollChatLog(dir: "up" | "down"): boolean {
  const pane = document.querySelector(
    ".conversation-scroll-pane",
  ) as HTMLElement | null;
  if (!pane) return false;
  const step = Math.max(60, pane.clientHeight * 0.4);
  pane.scrollBy({ top: dir === "down" ? step : -step, behavior: "smooth" });
  return true;
}

function isComposerFocused(): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (!active) return false;
  if (active.tagName !== "TEXTAREA") return false;
  return active.getAttribute("name") === "message";
}

export const FILE_PREVIEW_ATTR = "data-file-preview";

function inFilePreview(e: KeyboardEvent): boolean {
  const target = e.target as { closest?: (s: string) => unknown } | null;
  return !!target?.closest?.(`[${FILE_PREVIEW_ATTR}]`);
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
  if (isOverlayTarget(e) || inFilePreview(e)) return;
  const ui = useUIStore.getState();
  if (ui.missionPanelOpen) {
    if (isTypingTarget(e)) {
      if (!isComposerFocused()) return;
      if (!isEmptyEditable(e)) return;
    }
    if (dir !== "up" && dir !== "down") return;
    if (scrollChatLog(dir)) e.preventDefault();
    return;
  }
  if (isTypingTarget(e)) return;
  if (!isMissionBoardSurface(ui) || ui.paletteOpen || ui.cheatsheetOpen) return;
  e.preventDefault();
  ui.onBoardNavigate?.(dir);
}

function handleBoardOpen(e: KeyboardEvent): void {
  if (isTypingTarget(e) || isOverlayTarget(e)) return;
  const ui = useUIStore.getState();
  if (ui.missionPanelOpen || ui.paletteOpen || ui.cheatsheetOpen) return;
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
  if (e.defaultPrevented) return;
  const ui = useUIStore.getState();
  if (!ui.missionPanelOpen) return;
  if (isComposerFocused()) {
    const active = document.activeElement as HTMLElement | null;
    const log = document.querySelector('[role="log"]') as HTMLElement | null;
    active?.blur();
    log?.focus();
    e.preventDefault();
    return;
  }
  e.preventDefault();
  if (ui.filePreview) {
    ui.setFilePreview(null);
    return;
  }
  ui.onPanelClose?.();
}

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
