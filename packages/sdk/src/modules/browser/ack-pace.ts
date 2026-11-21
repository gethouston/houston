import {
  BROWSER_LIVE_LEGACY_WINDOW,
  type BrowserLiveWindow,
} from "@houston/wire-types";
import type { Clock } from "../../ports";

export const BROWSER_LIVE_ACK_INTERVAL_MS = 250;
const ACK_HEADROOM = 2;

export function eagerFrames(window: BrowserLiveWindow): number {
  return Math.max(1, window.frames - ACK_HEADROOM);
}

export function eagerBytes(window: BrowserLiveWindow): number {
  return window.bytes / 2;
}

export function ackPacer(clock: Clock, wake: () => void) {
  let frames: { seq: number; bytes: number }[] = [];
  let window = BROWSER_LIVE_LEGACY_WINDOW;
  let timer: number | null = null;
  let due = false;

  const disarm = () => {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
    due = false;
  };

  return {
    windowed(advertised: BrowserLiveWindow | undefined): void {
      window = advertised ?? BROWSER_LIVE_LEGACY_WINDOW;
    },
    received(seq: number, bytes: number): void {
      frames.push({ seq, bytes });
    },
    acked(seq: number): void {
      frames = frames.filter((sent) => sent.seq > seq);
    },
    ready(covered: number): boolean {
      const waiting = frames.filter((sent) => sent.seq > covered);
      if (waiting.length === 0) {
        disarm();
        return false;
      }
      const bytes = waiting.reduce((sum, sent) => sum + sent.bytes, 0);
      if (
        due ||
        waiting.length >= eagerFrames(window) ||
        bytes >= eagerBytes(window)
      ) {
        disarm();
        return true;
      }
      timer ??= clock.setTimeout(() => {
        timer = null;
        due = true;
        wake();
      }, BROWSER_LIVE_ACK_INTERVAL_MS);
      return false;
    },
    stop: disarm,
  };
}
