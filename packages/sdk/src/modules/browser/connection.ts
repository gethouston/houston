import type {
  BrowserLiveEvent,
  BrowserLiveInputAnswer,
  BrowserLiveInputRequest,
  BrowserLiveLayout,
} from "@houston/wire-types";
import type { Clock } from "../../ports";
import { createInputBatcher } from "./input-batcher";
import { classifyLiveFailure } from "./live-failure";
import { type BrowserLiveWatchOptions, startLiveStream } from "./live-stream";
import {
  BROWSER_LIVE_HEALTHY_MS,
  BROWSER_LIVE_MAX_ATTEMPTS,
  reconnectDelay,
} from "./reconnect-policy";
import { reportOnce } from "./report-once";

export {
  BROWSER_LIVE_IDLE_MS,
  type BrowserLiveWatchOptions,
} from "./live-stream";

import type {
  BrowserLiveConnection,
  BrowserLiveConnectionState,
  BrowserLiveHandlers,
} from "./types";

export interface BrowserLiveConnectionDeps {
  viewer: string;
  layout: BrowserLiveLayout;
  watch(options: BrowserLiveWatchOptions): Promise<void>;
  input(request: BrowserLiveInputRequest): Promise<BrowserLiveInputAnswer>;
  clock: Clock;
  isTransport(err: unknown): boolean;
  handlers: BrowserLiveHandlers;
}

type Ended = Extract<BrowserLiveConnectionState, { kind: "ended" }>;

export function openBrowserLiveConnection(
  deps: BrowserLiveConnectionDeps,
): BrowserLiveConnection {
  const { handlers, clock } = deps;
  let layout = deps.layout;
  let state: BrowserLiveConnectionState = { kind: "connecting" };
  let attempt = 0;
  let closed = false;
  let stopStream: (() => void) | null = null;
  let reconnectTimer: number | null = null;
  let healthyTimer: number | null = null;
  let handoff: string | undefined;
  const malformed = reportOnce(handlers.onUnexpected);
  const refused = reportOnce(handlers.onUnexpected);

  const setState = (next: BrowserLiveConnectionState) => {
    state = next;
    handlers.onConnection(next);
  };
  const dropStream = () => {
    if (reconnectTimer !== null) clock.clearTimeout(reconnectTimer);
    if (healthyTimer !== null) clock.clearTimeout(healthyTimer);
    reconnectTimer = healthyTimer = null;
    stopStream?.();
    stopStream = null;
  };
  const end = (reason: Ended["reason"]) => {
    if (closed || state.kind === "ended") return;
    dropStream();
    batcher.stop("answered");
    setState({ kind: "ended", reason });
  };
  const gone = () => closed || state.kind === "ended";

  const batcher = createInputBatcher({
    viewer: deps.viewer,
    post: deps.input,
    clock,
    isTransport: deps.isTransport,
    onAnswer: (answer) => {
      if (answer.refused) handlers.onRefused(answer.refused);
      if (answer.state !== "waiting") end(answer.state);
    },
    onEnded: (failure) => end(failure.reason),
    onUnexpected: handlers.onUnexpected,
  });

  const onEvent = (event: BrowserLiveEvent) => {
    if (gone()) return;
    if (state.kind !== "live") {
      setState({ kind: "live" });
      healthyTimer = clock.setTimeout(() => {
        healthyTimer = null;
        attempt = 0;
        refused.rearm();
      }, BROWSER_LIVE_HEALTHY_MS);
    }
    if (event.type === "frame") {
      handlers.onFrame(event);
      batcher.ack(event.seq, event.jpeg.length);
    } else if (event.type === "page") {
      handlers.onPage({ url: event.url, title: event.title });
    } else {
      if (handoff !== undefined && event.handoffId !== handoff)
        return end("none");
      handoff = event.handoffId;
      batcher.known(handoff, event.window);
      const { state: ended, text, expiresAt } = event;
      handlers.onStatus({ state: ended, text, expiresAt });
      if (ended !== "waiting") end(ended);
    }
  };

  const scheduleReconnect = () => {
    if (gone()) return;
    dropStream();
    attempt += 1;
    if (attempt > BROWSER_LIVE_MAX_ATTEMPTS) return setState({ kind: "lost" });
    setState({ kind: "reconnecting", attempt });
    reconnectTimer = clock.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, reconnectDelay(attempt));
  };

  const connect = () => {
    if (gone()) return;
    stopStream = startLiveStream({
      watch: deps.watch,
      viewer: deps.viewer,
      layout,
      handoff,
      clock,
      onEvent,
      onMalformed: malformed.report,
      onEnd: (streamEnd) => {
        stopStream = null;
        if (streamEnd.kind === "malformed") malformed.report(streamEnd.error);
        if (streamEnd.kind === "refused") {
          const failure = classifyLiveFailure(
            streamEnd.error,
            deps.isTransport,
          );
          if (failure.kind === "ended") return end(failure.reason);
          if (failure.kind === "unexpected") refused.report(streamEnd.error);
        }
        scheduleReconnect();
      },
    });
  };

  setState({ kind: "connecting" });
  connect();

  return {
    send: (event) => batcher.send(event),
    finish: (outcome) => batcher.finish(outcome),
    setLayout(next) {
      if (next === layout) return;
      layout = next;
      if (gone() || stopStream === null) return;
      dropStream();
      setState({ kind: "connecting" });
      connect();
    },
    retry() {
      if (closed || state.kind !== "lost") return;
      attempt = 0;
      refused.rearm();
      setState({ kind: "connecting" });
      connect();
    },
    close() {
      if (closed) return;
      closed = true;
      dropStream();
      batcher.stop("abandoned");
    },
  };
}
