import type { BrowserLiveInput, BrowserLiveKey } from "@houston/wire-types";

const KEYS: Record<BrowserLiveKey, readonly [code: number, text?: string]> = {
  Enter: [13, "\r"],
  Tab: [9],
  Backspace: [8],
  Delete: [46],
  Escape: [27],
  ArrowLeft: [37],
  ArrowUp: [38],
  ArrowRight: [39],
  ArrowDown: [40],
  Home: [36],
  End: [35],
  PageUp: [33],
  PageDown: [34],
};

export interface KeyEventParams {
  type: "keyDown" | "rawKeyDown" | "keyUp";
  key: string;
  code: string;
  windowsVirtualKeyCode: number;
  nativeVirtualKeyCode: number;
  modifiers: number;
  text?: string;
  unmodifiedText?: string;
}

export function keyPress(
  key: BrowserLiveKey,
  modifiers = 0,
): [KeyEventParams, KeyEventParams] {
  const [code, text] = KEYS[key];
  const base = {
    key,
    code: key,
    windowsVirtualKeyCode: code,
    nativeVirtualKeyCode: code,
    modifiers,
  };
  return [
    text
      ? { type: "keyDown", text, unmodifiedText: text, ...base }
      : { type: "rawKeyDown", ...base },
    { type: "keyUp", ...base },
  ];
}

const MOUSE_TYPE = {
  move: "mouseMoved",
  down: "mousePressed",
  up: "mouseReleased",
} as const;

export interface MouseEventParams {
  type: "mouseMoved" | "mousePressed" | "mouseReleased";
  x: number;
  y: number;
  button: "none" | "left";
  buttons?: number;
  clickCount: number;
}

export function mouseSteps(
  event: Extract<BrowserLiveInput, { type: "mouse" }>,
  at: { x: number; y: number },
): MouseEventParams[] {
  const clickCount = event.clickCount ?? 1;
  if (event.action === "click")
    return (["mouseMoved", "mousePressed", "mouseReleased"] as const).map(
      (type) => ({
        type,
        ...at,
        button: type === "mouseMoved" ? "none" : "left",
        clickCount,
      }),
    );
  const pressed = event.buttons === 1;
  return [
    {
      type: MOUSE_TYPE[event.action],
      ...at,
      button: event.action === "move" && !pressed ? "none" : "left",
      buttons: pressed ? 1 : 0,
      clickCount,
    },
  ];
}
