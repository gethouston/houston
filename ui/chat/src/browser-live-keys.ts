import {
  BROWSER_LIVE_VIEW_KEYS,
  BROWSER_LIVE_VIEW_MODIFIER,
  type BrowserLiveViewInput,
  type BrowserLiveViewKey,
} from "./browser-live-types";

export interface BrowserLiveKeySample {
  key: string;
  isComposing: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  keyCode?: number;
}

const IME_PROCESSING = 229;

const SPECIAL: ReadonlySet<string> = new Set(BROWSER_LIVE_VIEW_KEYS);

function isSpecialKey(key: string): key is BrowserLiveViewKey {
  return SPECIAL.has(key);
}

export function modifierBits(sample: BrowserLiveKeySample): number {
  return (
    (sample.altKey ? BROWSER_LIVE_VIEW_MODIFIER.alt : 0) |
    (sample.ctrlKey ? BROWSER_LIVE_VIEW_MODIFIER.ctrl : 0) |
    (sample.metaKey ? BROWSER_LIVE_VIEW_MODIFIER.meta : 0) |
    (sample.shiftKey ? BROWSER_LIVE_VIEW_MODIFIER.shift : 0)
  );
}

export function keyDownInput(
  sample: BrowserLiveKeySample,
): BrowserLiveViewInput | null {
  if (sample.isComposing || sample.keyCode === IME_PROCESSING) return null;
  if (!isSpecialKey(sample.key)) return null;
  const modifiers = modifierBits(sample);
  return modifiers === 0
    ? { type: "key", key: sample.key }
    : { type: "key", key: sample.key, modifiers };
}

export function isLeavePageKey(sample: BrowserLiveKeySample): boolean {
  return (
    sample.key === "Escape" &&
    sample.shiftKey &&
    !sample.altKey &&
    !sample.ctrlKey &&
    !sample.metaKey
  );
}

export function beforeInputKey(
  inputType: string,
  fieldValue: string,
): BrowserLiveViewInput | null {
  return inputType === "deleteContentBackward" && fieldValue === ""
    ? { type: "key", key: "Backspace" }
    : null;
}

export function textInput(value: string): BrowserLiveViewInput | null {
  return value ? { type: "text", text: value } : null;
}
