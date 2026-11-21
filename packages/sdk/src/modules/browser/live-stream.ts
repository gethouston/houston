import type { BrowserLiveEvent, BrowserLiveLayout } from "@houston/wire-types";
import type { Clock } from "../../ports";

export const BROWSER_LIVE_IDLE_MS = 45_000;

export interface BrowserLiveWatchOptions {
  viewer: string;
  layout: BrowserLiveLayout;
  handoff: string | undefined;
  signal: AbortSignal;
  onEvent: (event: BrowserLiveEvent) => void;
  onActivity?: () => void;
  onMalformed?: (error: unknown) => void;
}

export type LiveStreamEnd =
  | { kind: "cut" }
  | { kind: "refused"; error: unknown }
  | { kind: "malformed"; error: unknown };

export interface LiveStreamAttempt {
  watch(options: BrowserLiveWatchOptions): Promise<void>;
  viewer: string;
  layout: BrowserLiveLayout;
  handoff: string | undefined;
  clock: Clock;
  onEvent(event: BrowserLiveEvent): void;
  onMalformed(error: unknown): void;
  onEnd(end: LiveStreamEnd): void;
}

export function startLiveStream(attempt: LiveStreamAttempt): () => void {
  const { clock } = attempt;
  const controller = new AbortController();
  let live = true;
  let opened = false;
  let idle: number | null = null;
  const stop = () => {
    live = false;
    if (idle !== null) clock.clearTimeout(idle);
    idle = null;
    controller.abort();
  };
  const finish = (end: LiveStreamEnd) => {
    if (!live) return;
    stop();
    attempt.onEnd(end);
  };
  const armIdle = () => {
    if (idle !== null) clock.clearTimeout(idle);
    idle = clock.setTimeout(
      () => finish({ kind: "cut" }),
      BROWSER_LIVE_IDLE_MS,
    );
  };
  armIdle();
  attempt
    .watch({
      viewer: attempt.viewer,
      layout: attempt.layout,
      handoff: attempt.handoff,
      signal: controller.signal,
      onEvent: (event) => {
        if (live) attempt.onEvent(event);
      },
      onActivity: () => {
        if (!live) return;
        opened = true;
        armIdle();
      },
      onMalformed: (error) => {
        if (live) attempt.onMalformed(error);
      },
    })
    .then(
      () => finish({ kind: "cut" }),
      (error: unknown) => {
        if (error instanceof SyntaxError)
          return finish({ kind: "malformed", error });
        finish(opened ? { kind: "cut" } : { kind: "refused", error });
      },
    )
    .finally(stop);
  return stop;
}
