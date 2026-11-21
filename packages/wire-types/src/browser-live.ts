export const BROWSER_LIVE_REST = "conversations/:conversationId/browser/live";
export const BROWSER_INPUT_REST = "conversations/:conversationId/browser/input";

export const BROWSER_HANDOFF_STATES = [
  "waiting",
  "done",
  "cancelled",
  "expired",
] as const;
export type BrowserHandoffState = (typeof BROWSER_HANDOFF_STATES)[number];
export type BrowserHandoffEnd = Exclude<BrowserHandoffState, "waiting">;

export const BROWSER_HANDOFF_LIMIT_MS = 10 * 60_000;

export const BROWSER_HANDOFF_FAILURES = [
  "handoff_cancelled",
  "handoff_expired",
  "handoff_unavailable",
] as const;
export type BrowserHandoffFailure = (typeof BROWSER_HANDOFF_FAILURES)[number];

export type BrowserLiveLayout = "desktop" | "phone";
export const BROWSER_LIVE_VIEWER = /^[A-Za-z0-9_-]{8,64}$/;
export const BROWSER_LIVE_HANDOFF = /^[A-Za-z0-9_-]{8,64}$/;

export interface BrowserLiveFrame {
  type: "frame";
  seq: number;
  jpeg: string;
  width: number;
  height: number;
}
export interface BrowserLivePage {
  type: "page";
  url: string;
  title: string;
}
export interface BrowserLiveStatus {
  type: "status";
  handoffId: string;
  state: BrowserHandoffState;
  text: string;
  expiresAt: number;
  window?: BrowserLiveWindow;
}
export interface BrowserLiveWindow {
  frames: number;
  bytes: number;
}
export type BrowserLiveEvent =
  | BrowserLiveFrame
  | BrowserLivePage
  | BrowserLiveStatus;

export const BROWSER_LIVE_KEYS = [
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
export type BrowserLiveKey = (typeof BROWSER_LIVE_KEYS)[number];
export const BROWSER_LIVE_MODIFIER = {
  alt: 1,
  ctrl: 2,
  meta: 4,
  shift: 8,
} as const;

export type BrowserLiveMouseAction = "move" | "down" | "up" | "click";

export type BrowserLiveInput =
  | {
      type: "mouse";
      action: BrowserLiveMouseAction;
      x: number;
      y: number;
      buttons?: 0 | 1;
      clickCount?: 1 | 2 | 3;
    }
  | { type: "wheel"; x: number; y: number; dx: number; dy: number }
  | { type: "key"; key: BrowserLiveKey; modifiers?: number }
  | { type: "text"; text: string }
  | { type: "navigate"; url: string }
  | { type: "back" };

export const BROWSER_LIVE_MAX_EVENTS = 64;
export const BROWSER_LIVE_MAX_TEXT = 10_000;
export const BROWSER_LIVE_MAX_BODY_BYTES = 64 * 1024;
export const BROWSER_LIVE_FRAME_WINDOW = 8;
export const BROWSER_LIVE_FRAME_WINDOW_BYTES = 320 * 1024;
export const BROWSER_LIVE_LEGACY_WINDOW: BrowserLiveWindow = {
  frames: 2,
  bytes: Number.POSITIVE_INFINITY,
};
export const BROWSER_LIVE_INPUT_TIMEOUT_MS = 15_000;

export interface BrowserLiveInputRequest {
  handoff?: string;
  events?: BrowserLiveInput[];
  ack?: { viewer: string; seq: number };
  batch?: { viewer: string; seq: number };
  finish?: "done" | "cancel";
}
export interface BrowserLiveInputAnswer {
  state: BrowserHandoffState;
  refused?: "url_refused";
}

export const BROWSER_LIVE_REFUSALS = [
  "no_handoff",
  "handoff_ended",
  "not_handoff_owner",
  "invalid_input",
] as const;
export type BrowserLiveRefusal = (typeof BROWSER_LIVE_REFUSALS)[number];
