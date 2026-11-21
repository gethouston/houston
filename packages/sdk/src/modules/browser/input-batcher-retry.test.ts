import {
  BROWSER_LIVE_INPUT_TIMEOUT_MS,
  BROWSER_LIVE_MAX_BODY_BYTES,
  BROWSER_LIVE_MAX_TEXT,
} from "@houston/wire-types";
import { describe, expect, it } from "vitest";
import { encodedBytes } from "./input-queue";
import { flush, HANDOFF, httpError, liveHarness } from "./live-test-kit";

const move = (x: number) =>
  ({ type: "mouse", action: "move", x, y: 0.5 }) as const;
const frame = (seq: number) =>
  ({ type: "frame", seq, jpeg: "AAA", width: 1, height: 1 }) as const;
const offline = () => new TypeError("Failed to fetch");

describe("the browser live input's retries", () => {
  it("re-sends a failed batch under the same seq, stale moves dropped", async () => {
    const h = liveHarness();
    h.known();
    h.connection.send({ type: "text", text: "a" });
    h.posts[0].reject(offline());
    await flush();
    h.connection.send({ type: "back" });
    await h.advance(500);
    expect(h.posts[1].request).toEqual({
      handoff: HANDOFF,
      events: [{ type: "text", text: "a" }],
      batch: { viewer: "viewer_12345", seq: 1 },
    });
    h.posts[1].resolve({ state: "waiting" });
    await flush();
    expect(h.posts[2].request).toMatchObject({
      events: [{ type: "back" }],
      batch: { seq: 2 },
    });
    expect(h.handlers.onUnexpected).not.toHaveBeenCalled();
  });

  it("keeps only a trailing move in a batch it re-sends", async () => {
    const h = liveHarness();
    h.known();
    h.connection.send({ type: "back" });
    h.connection.send(move(0.1));
    h.connection.send({ type: "back" });
    h.connection.send(move(0.2));
    h.posts[0].resolve({ state: "waiting" });
    await flush();
    expect(h.posts[1].request.events).toEqual([
      move(0.1),
      { type: "back" },
      move(0.2),
    ]);
    h.posts[1].reject(offline());
    await flush();
    await h.advance(500);
    expect(h.posts[2].request.events).toEqual([{ type: "back" }, move(0.2)]);
    expect(h.posts[2].request.batch?.seq).toBe(2);
  });

  it("times a stuck POST out and retries it as a network failure", async () => {
    const h = liveHarness();
    h.known();
    h.connection.send({ type: "back" });
    await h.advance(BROWSER_LIVE_INPUT_TIMEOUT_MS - 1);
    expect(h.posts).toHaveLength(1);
    await h.advance(1);
    await h.advance(500);
    expect(h.posts[1].request).toMatchObject({ batch: { seq: 1 } });
    h.posts[0].resolve({ state: "done" });
    await flush();
    expect(h.states.at(-1)).toEqual({ kind: "live" });
    expect(h.handlers.onUnexpected).not.toHaveBeenCalled();
  });

  it("backs a refused batch off, drops it, and reports once per episode", async () => {
    const h = liveHarness();
    h.known();
    h.connection.send({ type: "back" });
    h.connection.send({ type: "text", text: "x" });
    const refusal = httpError(400, '{"error":"invalid_input"}');
    h.posts[0].reject(refusal);
    await flush();
    expect(h.posts).toHaveLength(1);
    await h.advance(500);
    expect(h.posts[1].request).toMatchObject({
      events: [{ type: "text", text: "x" }],
      batch: { seq: 2 },
    });
    h.posts[1].reject(refusal);
    await flush();
    expect(h.handlers.onUnexpected).toHaveBeenCalledTimes(1);
  });

  it("does not re-send a refused ack, and backs its lane off", async () => {
    const h = liveHarness();
    h.known();
    h.streams[0].onEvent(frame(1));
    await h.advance(250);
    h.posts[0].reject(httpError(400, "{}"));
    await flush();
    await h.advance(1000);
    expect(h.posts).toHaveLength(1);
    h.streams[0].onEvent(frame(2));
    await h.advance(250);
    expect(h.posts[1].request).toEqual({
      handoff: HANDOFF,
      ack: { viewer: "viewer_12345", seq: 2 },
    });
    expect(h.handlers.onUnexpected).toHaveBeenCalledTimes(1);
  });

  it("splits a paste past the text limit and keeps every body under 64 KB", async () => {
    const h = liveHarness();
    h.known();
    h.connection.send({ type: "back" });
    const paste = `${"é".repeat(BROWSER_LIVE_MAX_TEXT)}${"😀".repeat(9000)}`;
    h.connection.send({ type: "text", text: paste });
    h.posts[0].resolve({ state: "waiting" });
    await flush();
    let sent = "";
    for (let i = 1; i < h.posts.length || sent.length < paste.length; i++) {
      const request = h.posts[i].request;
      expect(encodedBytes(request)).toBeLessThanOrEqual(
        BROWSER_LIVE_MAX_BODY_BYTES,
      );
      for (const event of request.events ?? []) {
        if (event.type !== "text") continue;
        expect(event.text.length).toBeLessThanOrEqual(BROWSER_LIVE_MAX_TEXT);
        sent += event.text;
      }
      h.posts[i].resolve({ state: "waiting" });
      await flush();
    }
    expect(sent).toBe(paste);
  });

  it("an ack success does not re-arm the event lane's report of a repeated refusal", async () => {
    const h = liveHarness();
    h.known();
    const refusal = httpError(400, '{"error":"invalid_input"}');
    h.connection.send({ type: "back" });
    h.posts[0].reject(refusal);
    await flush();
    h.streams[0].onEvent(frame(1));
    await h.advance(250);
    expect(h.posts[1].request).toEqual({
      handoff: HANDOFF,
      ack: { viewer: "viewer_12345", seq: 1 },
    });
    h.posts[1].resolve({ state: "waiting" });
    await flush();
    h.connection.send({ type: "back" });
    await h.advance(500);
    expect(h.posts[2].request).toMatchObject({ batch: { seq: 2 } });
    h.posts[2].reject(refusal);
    await flush();
    expect(h.handlers.onUnexpected).toHaveBeenCalledTimes(1);
    h.connection.send({ type: "back" });
    await h.advance(1000);
    h.posts[3].resolve({ state: "waiting" });
    await flush();
    h.connection.send({ type: "back" });
    h.posts[4].reject(refusal);
    await flush();
    expect(h.handlers.onUnexpected).toHaveBeenCalledTimes(2);
  });

  it("a POST answering after close reaches nothing", async () => {
    const h = liveHarness();
    h.known();
    h.connection.send({ type: "navigate", url: "file:///etc" });
    h.connection.close();
    h.posts[0].resolve({ state: "waiting", refused: "url_refused" });
    await flush();
    expect(h.handlers.onRefused).not.toHaveBeenCalled();
    expect(h.posts).toHaveLength(1);
    expect(h.states).toEqual([{ kind: "connecting" }, { kind: "live" }]);
  });
});
