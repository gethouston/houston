export const BROWSER_LIVE_VIEW_KEYS = [
  "Enter",
  "Tab",
  "Backspace",
  "Delete",
  "Escape",
  "ArrowLeft",
  "ArrowUp",
  "ArrowRight",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
] as const;
export type BrowserLiveViewKey = (typeof BROWSER_LIVE_VIEW_KEYS)[number];

export const BROWSER_LIVE_VIEW_MODIFIER = {
  alt: 1,
  ctrl: 2,
  meta: 4,
  shift: 8,
} as const;

export type BrowserLiveViewInput =
  | {
      type: "mouse";
      action: "move" | "down" | "up" | "click";
      x: number;
      y: number;
      buttons?: 0 | 1;
      clickCount?: 1 | 2 | 3;
    }
  | { type: "wheel"; x: number; y: number; dx: number; dy: number }
  | { type: "key"; key: BrowserLiveViewKey; modifiers?: number }
  | { type: "text"; text: string }
  | { type: "navigate"; url: string }
  | { type: "back" };

export interface BrowserLiveViewFrame {
  seq: number;
  jpeg: string;
  width: number;
  height: number;
}

export interface BrowserLiveFrames {
  subscribe(listener: (frame: BrowserLiveViewFrame) => void): () => void;
  latest(): BrowserLiveViewFrame | null;
}

export type BrowserLiveViewState =
  | "connecting"
  | "live"
  | "reconnecting"
  | "lost"
  | "done"
  | "cancelled"
  | "expired"
  | "none"
  | "not_owner";

export function isBrowserLiveViewEnded(state: BrowserLiveViewState): boolean {
  return (
    state === "done" ||
    state === "cancelled" ||
    state === "expired" ||
    state === "none" ||
    state === "not_owner"
  );
}

export type BrowserHandoffCardState =
  | "waiting"
  | "done"
  | "cancelled"
  | "expired"
  | "ended";
