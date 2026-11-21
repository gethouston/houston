import { describe, expect, it } from "vitest";
import {
  BROWSER_LIVE_ACK_INTERVAL_MS,
  eagerBytes,
  eagerFrames,
} from "./ack-pace";
import { flush, HANDOFF, liveHarness, WINDOW } from "./live-test-kit";

const EAGER = eagerFrames(WINDOW);
const frame = (seq: number, bytes = 3) =>
  ({
    type: "frame",
    seq,
    jpeg: "A".repeat(bytes),
    width: 1,
    height: 1,
  }) as const;
const ack = (seq: number) => ({
  handoff: HANDOFF,
  ack: { viewer: "viewer_12345", seq },
});

async function drive(
  frames: number,
  everyMs: number,
  rttMs: number,
  bytes = 3,
) {
  const h = liveHarness();
  h.known();
  let painted = 0;
  let shown = 0;
  let acked = 0;
  const answers: number[] = [];
  let now = 0;
  while (shown < frames) {
    if (now % everyMs === 0) painted += 1;
    const unacked = shown - acked;
    const fits =
      unacked === 0 ||
      (unacked < WINDOW.frames && (unacked + 1) * bytes <= WINDOW.bytes);
    if (painted > shown && fits) {
      shown = painted;
      h.streams[0].onEvent(frame(shown, bytes));
    }
    while (answers.length < h.posts.length) answers.push(now + rttMs);
    answers.forEach((at, i) => {
      if (at !== now) return;
      acked = Math.max(acked, h.posts[i].request.ack?.seq ?? 0);
      h.posts[i].resolve({ state: "waiting" });
    });
    await h.advance(1);
    now += 1;
  }
  return { posts: h.posts.length, elapsed: now };
}

describe("the browser live view's frame acks", () => {
  it("coalesce a trickle into one ack per interval", async () => {
    const h = liveHarness();
    h.known();
    h.streams[0].onEvent(frame(1));
    await h.advance(100);
    h.streams[0].onEvent(frame(2));
    expect(h.posts).toHaveLength(0);
    await h.advance(BROWSER_LIVE_ACK_INTERVAL_MS - 100);
    expect(h.posts.map((p) => p.request)).toEqual([ack(2)]);
  });

  it("go at once when the window is about to fill", () => {
    expect(EAGER).toBe(6);
    const h = liveHarness();
    h.known();
    for (let seq = 1; seq <= EAGER; seq++) h.streams[0].onEvent(frame(seq));
    expect(h.posts.map((p) => p.request)).toEqual([ack(EAGER)]);
  });

  it("go at once when half the window's bytes wait on them", () => {
    const h = liveHarness();
    h.known();
    const half = eagerBytes(WINDOW);
    h.streams[0].onEvent(frame(1, half - 1));
    expect(h.posts).toHaveLength(0);
    h.streams[0].onEvent(frame(2, 1));
    expect(h.posts.map((p) => p.request)).toEqual([ack(2)]);
  });

  it("ack every frame of a runtime that advertises no window", () => {
    const h = liveHarness();
    h.known(HANDOFF, "waiting", null);
    h.streams[0].onEvent(frame(1));
    expect(h.posts.map((p) => p.request)).toEqual([ack(1)]);
  });

  it("follow the window the runtime advertised", () => {
    const h = liveHarness();
    h.known(HANDOFF, "waiting", { frames: 4, bytes: 1_000_000 });
    h.streams[0].onEvent(frame(1));
    expect(h.posts).toHaveLength(0);
    h.streams[0].onEvent(frame(2));
    expect(h.posts.map((p) => p.request)).toEqual([ack(2)]);
  });

  it("send nothing while every frame is covered", async () => {
    const h = liveHarness();
    h.known();
    h.connection.send({ type: "back" });
    h.streams[0].onEvent(frame(1));
    expect(h.posts[0].request.ack?.seq).toBeUndefined();
    await h.advance(BROWSER_LIVE_ACK_INTERVAL_MS);
    expect(h.posts.map((p) => p.request)).toEqual([
      expect.objectContaining({ events: [{ type: "back" }] }),
      ack(1),
    ]);
    h.posts[1].resolve({ state: "waiting" });
    await flush();
    await h.advance(10 * BROWSER_LIVE_ACK_INTERVAL_MS);
    expect(h.posts).toHaveLength(2);
  });

  it("keep a 30 fps page under one POST per four frames and the picture moving", async () => {
    const { posts, elapsed } = await drive(120, 33, 150);
    expect(posts).toBeLessThanOrEqual(120 / 4);
    expect(elapsed).toBeLessThan(4200);
  });

  it("keep big frames on a slow link moving within the byte window", async () => {
    const { posts, elapsed } = await drive(60, 33, 300, 80 * 1024);
    expect(posts).toBeLessThanOrEqual(60 / 2);
    expect(elapsed).toBeLessThan(60 * 33 * 1.5);
  });

  it("keep a slow page to at most four POSTs a second", async () => {
    const { posts, elapsed } = await drive(30, 100, 150);
    expect(posts / (elapsed / 1000)).toBeLessThanOrEqual(4);
  });
});
