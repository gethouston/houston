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

/** x, y are 0..1 of the frame; wheel deltas are page pixels. */
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
  /** Base64 JPEG, no data-URL prefix. */
  jpeg: string;
  width: number;
  height: number;
}

/**
 * Frames bypass React state: the stage subscribes and paints straight onto a
 * canvas, so a 10 fps stream never re-renders the view.
 */
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

/** The view's ended states: no input, only Close. */
export function isBrowserLiveViewEnded(state: BrowserLiveViewState): boolean {
  return (
    state === "done" ||
    state === "cancelled" ||
    state === "expired" ||
    state === "none" ||
    state === "not_owner"
  );
}

/** Mirrors the SDK's `BrowserHandoffCardState`. */
export type BrowserHandoffCardState =
  | "waiting"
  | "done"
  | "cancelled"
  | "expired"
  | "ended";
