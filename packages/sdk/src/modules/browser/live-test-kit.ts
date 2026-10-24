/**
 * Test support for the live-view suites: a clock the test moves by hand, and
 * fake `watch`/`input` operations whose every call the test settles.
 */

import {
  BROWSER_LIVE_FRAME_WINDOW,
  BROWSER_LIVE_FRAME_WINDOW_BYTES,
  type BrowserLiveInputAnswer,
  type BrowserLiveInputRequest,
  type BrowserLiveWindow,
} from "@houston/wire-types";
import { type Mock, vi } from "vitest";
import type { Clock } from "../../ports";
import {
  type BrowserLiveConnectionDeps,
  type BrowserLiveWatchOptions,
  openBrowserLiveConnection,
} from "./connection";
import type { BrowserLiveConnectionState, BrowserLiveHandlers } from "./types";

export function manualClock() {
  let now = 0;
  let next = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const clock: Clock = {
    now: () => now,
    setTimeout: (fn, ms) => {
      timers.set(next, { at: now + ms, fn });
      return next++;
    },
    clearTimeout: (id) => void timers.delete(id),
  };
  const advance = async (ms: number) => {
    const end = now + ms;
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, t]) => t.at <= end)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      now = due[1].at;
      due[1].fn();
      await flush();
    }
    now = end;
  };
  return { clock, advance, pending: () => timers.size };
}

export const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

interface Deferred<T> {
  resolve(value: T): void;
  reject(err: unknown): void;
}

function deferred<T>(): Deferred<T> & { promise: Promise<T> } {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** The hand-off id {@link liveHarness}'s `known()` names by default. */
export const HANDOFF = "handoff-1";
/** The window {@link liveHarness}'s `known()` advertises by default. */
export const WINDOW: BrowserLiveWindow = {
  frames: BROWSER_LIVE_FRAME_WINDOW,
  bytes: BROWSER_LIVE_FRAME_WINDOW_BYTES,
};

export function httpError(status: number, body = "") {
  return Object.assign(new Error(`engine ${status}`), { status, body });
}

export function liveHarness() {
  const { clock, advance, pending } = manualClock();
  const streams: (BrowserLiveWatchOptions & Deferred<void>)[] = [];
  const posts: (Deferred<BrowserLiveInputAnswer> & {
    request: BrowserLiveInputRequest;
  })[] = [];
  const states: BrowserLiveConnectionState[] = [];
  const handlers: Record<keyof BrowserLiveHandlers, Mock> = {
    onFrame: vi.fn(),
    onPage: vi.fn(),
    onStatus: vi.fn(),
    onConnection: vi.fn((s: BrowserLiveConnectionState) => states.push(s)),
    onRefused: vi.fn(),
    onUnexpected: vi.fn(),
  } satisfies BrowserLiveHandlers;
  const deps: BrowserLiveConnectionDeps = {
    viewer: "viewer_12345",
    layout: "phone",
    watch: (options) => {
      const d = deferred<void>();
      streams.push({ ...options, ...d });
      return d.promise;
    },
    input: (request) => {
      const d = deferred<BrowserLiveInputAnswer>();
      posts.push({ ...d, request });
      return d.promise;
    },
    clock,
    isTransport: (err) =>
      err instanceof TypeError && err.message === "Failed to fetch",
    handlers,
  };
  const connection = openBrowserLiveConnection(deps);
  /**
   * The latest stream's first status: names the hand-off, so input flows, and
   * advertises `window` (null: none, as a runtime older than the field).
   */
  const known = (
    handoffId = HANDOFF,
    state: "waiting" | "done" = "waiting",
    window: BrowserLiveWindow | null = WINDOW,
  ) =>
    streams.at(-1)?.onEvent({
      type: "status",
      handoffId,
      state,
      text: "Sign in",
      expiresAt: 600_000,
      ...(window ? { window } : {}),
    });
  return {
    connection,
    streams,
    posts,
    states,
    handlers,
    advance,
    pending,
    known,
  };
}
