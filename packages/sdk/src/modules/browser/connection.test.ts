import { describe, expect, it } from "vitest";
import { BROWSER_LIVE_IDLE_MS } from "./connection";
import { flush, httpError, liveHarness } from "./live-test-kit";
import {
  BROWSER_LIVE_HEALTHY_MS,
  BROWSER_LIVE_MAX_ATTEMPTS,
} from "./reconnect-policy";

const frame = (seq: number) =>
  ({ type: "frame", seq, jpeg: "AAA", width: 412, height: 860 }) as const;
const waiting = {
  type: "status",
  handoffId: "handoff-1",
  state: "waiting",
  text: "Sign in",
  expiresAt: 600_000,
} as const;

describe("the browser live connection's stream", () => {
  it("opens one stream with its viewer and layout and goes live on the first event", () => {
    const h = liveHarness();
    expect(h.streams).toHaveLength(1);
    expect(h.streams[0]).toMatchObject({
      viewer: "viewer_12345",
      layout: "phone",
    });
    h.streams[0].onEvent(waiting);
    h.streams[0].onEvent({ type: "page", url: "https://a.com", title: "A" });
    h.streams[0].onEvent(frame(1));
    expect(h.states).toEqual([{ kind: "connecting" }, { kind: "live" }]);
    expect(h.handlers.onStatus).toHaveBeenCalledWith({
      state: "waiting",
      text: "Sign in",
      expiresAt: 600_000,
    });
    expect(h.handlers.onPage).toHaveBeenCalledWith({
      url: "https://a.com",
      title: "A",
    });
    expect(h.handlers.onFrame).toHaveBeenCalledWith(frame(1));
  });

  it("ends on a terminal status and stops the stream", () => {
    const h = liveHarness();
    h.streams[0].onEvent({ ...waiting, state: "expired" });
    expect(h.states.at(-1)).toEqual({ kind: "ended", reason: "expired" });
    expect(h.streams[0].signal.aborted).toBe(true);
  });

  it.each([
    [404, { kind: "ended", reason: "none" }],
    [403, { kind: "ended", reason: "not_owner" }],
  ])("ends on a %i", async (status, state) => {
    const h = liveHarness();
    h.streams[0].reject(httpError(status));
    await flush();
    expect(h.states.at(-1)).toEqual(state);
    expect(h.handlers.onUnexpected).not.toHaveBeenCalled();
  });

  it("reconnects with backoff, gives up as lost, and retries on demand", async () => {
    const h = liveHarness();
    const pauses = [500, 1000, 2000, 4000, 8000, 8000, 8000, 8000];
    for (let i = 0; i < BROWSER_LIVE_MAX_ATTEMPTS; i++) {
      h.streams[i].reject(new TypeError("Failed to fetch"));
      await flush();
      expect(h.states.at(-1)).toEqual({ kind: "reconnecting", attempt: i + 1 });
      await h.advance(pauses[i] - 1);
      expect(h.streams).toHaveLength(i + 1);
      await h.advance(1);
      expect(h.streams).toHaveLength(i + 2);
    }
    h.streams[BROWSER_LIVE_MAX_ATTEMPTS].reject(
      new TypeError("Failed to fetch"),
    );
    await flush();
    expect(h.states.at(-1)).toEqual({ kind: "lost" });
    await h.advance(60_000);
    expect(h.streams).toHaveLength(BROWSER_LIVE_MAX_ATTEMPTS + 1);
    h.connection.retry();
    expect(h.states.at(-1)).toEqual({ kind: "connecting" });
    expect(h.streams).toHaveLength(BROWSER_LIVE_MAX_ATTEMPTS + 2);
    expect(h.handlers.onUnexpected).not.toHaveBeenCalled();
  });

  it("resets the attempt count only once a stream stayed up", async () => {
    const h = liveHarness();
    h.streams[0].resolve();
    await flush();
    await h.advance(500);
    h.streams[1].onEvent(waiting);
    h.streams[1].onEvent(frame(1));
    h.streams[1].resolve();
    await flush();
    expect(h.states.at(-1)).toEqual({ kind: "reconnecting", attempt: 2 });
    await h.advance(1000);
    h.streams[2].onEvent(waiting);
    await h.advance(BROWSER_LIVE_HEALTHY_MS);
    h.streams[2].resolve();
    await flush();
    expect(h.states.at(-1)).toEqual({ kind: "reconnecting", attempt: 1 });
  });

  it("reconnects a stream that goes 45 s without a byte", async () => {
    const h = liveHarness();
    await h.advance(BROWSER_LIVE_IDLE_MS - 1);
    h.streams[0].onActivity?.();
    await h.advance(BROWSER_LIVE_IDLE_MS - 1);
    expect(h.streams[0].signal.aborted).toBe(false);
    await h.advance(1);
    expect(h.streams[0].signal.aborted).toBe(true);
    h.streams[0].reject(new DOMException("aborted", "AbortError"));
    await flush();
    expect(h.states.at(-1)).toEqual({ kind: "reconnecting", attempt: 1 });
    expect(h.handlers.onUnexpected).not.toHaveBeenCalled();
  });

  it("reports a stream failure that is no HTTP answer, then reconnects", async () => {
    const h = liveHarness();
    const drift = new Error("Invalid browser live event type");
    h.streams[0].reject(drift);
    await flush();
    expect(h.handlers.onUnexpected).toHaveBeenCalledWith(drift);
    expect(h.states.at(-1)).toEqual({ kind: "reconnecting", attempt: 1 });
  });

  it("close stops watching without reporting the abort", async () => {
    const h = liveHarness();
    h.connection.close();
    expect(h.streams[0].signal.aborted).toBe(true);
    h.streams[0].reject(new DOMException("aborted", "AbortError"));
    await flush();
    await h.advance(60_000);
    expect(h.streams).toHaveLength(1);
    expect(h.states).toEqual([{ kind: "connecting" }]);
  });
});

describe("the browser live connection's failures and layout", () => {
  it("treats a read error after the stream answered as a drop, unreported", async () => {
    const h = liveHarness();
    h.streams[0].onActivity?.();
    h.streams[0].onEvent(waiting);
    h.streams[0].reject(new TypeError("network error"));
    await flush();
    expect(h.states.at(-1)).toEqual({ kind: "reconnecting", attempt: 1 });
    h.streams.length = 0;
    await h.advance(500);
    h.streams[0].onActivity?.();
    h.streams[0].reject(new TypeError("Error in body stream"));
    await flush();
    expect(h.handlers.onUnexpected).not.toHaveBeenCalled();
  });

  it("aborts the request on every exit and reports drift once", async () => {
    const h = liveHarness();
    const garbled = new SyntaxError("Unexpected token");
    h.streams[0].onActivity?.();
    h.streams[0].reject(garbled);
    await flush();
    expect(h.streams[0].signal.aborted).toBe(true);
    await h.advance(500);
    h.streams[1].onMalformed?.(new Error("Invalid browser live frame jpeg"));
    h.streams[1].resolve();
    await flush();
    expect(h.streams[1].signal.aborted).toBe(true);
    expect(h.handlers.onUnexpected).toHaveBeenCalledTimes(1);
    expect(h.handlers.onUnexpected).toHaveBeenCalledWith(garbled);
  });

  it("re-opens the stream for a new layout, keeping queued input and finish", async () => {
    const h = liveHarness();
    h.known();
    h.connection.send({ type: "back" });
    const finished = h.connection.finish("done");
    h.connection.setLayout("desktop");
    expect(h.streams[0].signal.aborted).toBe(true);
    expect(h.streams[1].layout).toBe("desktop");
    h.streams[0].reject(new DOMException("aborted", "AbortError"));
    h.posts[0].resolve({ state: "waiting" });
    await flush();
    expect(h.posts[1].request).toMatchObject({
      handoff: "handoff-1",
      finish: "done",
    });
    expect(h.streams[1].handoff).toBe("handoff-1");
    h.posts[1].resolve({ state: "done" });
    await expect(finished).resolves.toBe("answered");
    expect(h.streams).toHaveLength(2);
  });

  it("a layout change while lost waits for the retry", async () => {
    const h = liveHarness();
    for (let i = 0; i <= BROWSER_LIVE_MAX_ATTEMPTS; i++) {
      h.streams[i].reject(new TypeError("Failed to fetch"));
      await flush();
      await h.advance(8000);
    }
    expect(h.states.at(-1)).toEqual({ kind: "lost" });
    h.connection.setLayout("desktop");
    expect(h.streams).toHaveLength(BROWSER_LIVE_MAX_ATTEMPTS + 1);
    h.connection.retry();
    expect(h.streams.at(-1)?.layout).toBe("desktop");
  });
});
