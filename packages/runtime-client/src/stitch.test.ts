import { expect, test } from "vitest";
import type { SequencedFrame } from "./replay";
import type { ConversationSnapshot } from "./snapshot";
import { type ResumableStreamSource, serveResumableStream } from "./stitch";
import { StreamChannel } from "./stream-channel";
import type { WireEvent, WireFrame } from "./types";

/**
 * The shared resume stitch, driven against a real StreamChannel: replay vs
 * sync vs resync decisions, the gap/dupe-free flush of frames that arrive
 * during the async reads, and — critically — that the watermark dedupe dies
 * with the flush (a seq regression must not starve a connected subscriber).
 */

const user = (content: string): WireEvent => ({
  type: "user",
  data: { content, ts: 1 },
});
const text = (s: string): WireEvent => ({ type: "text", data: s });

/** A source over a StreamChannel with injectable read delays. */
function makeSource(opts?: { delayReads?: () => Promise<void> }) {
  let channel = new StreamChannel();
  const subscribers = new Set<(f: SequencedFrame) => void>();
  const delay = opts?.delayReads ?? (() => Promise.resolve());
  const source: ResumableStreamSource = {
    subscribe(deliver) {
      subscribers.add(deliver);
      return () => subscribers.delete(deliver);
    },
    async snapshot(): Promise<ConversationSnapshot> {
      await delay();
      return channel.snapshot;
    },
    async replayAfter(after) {
      await delay();
      return channel.replayAfter(after);
    },
  };
  return {
    source,
    publish(event: WireFrame) {
      channel.publish(event, (frame) => {
        for (const cb of [...subscribers]) cb(frame);
      });
    },
    /** Simulate a full authority restart: fresh channel, seq counter back to 0. */
    resetChannel() {
      channel = new StreamChannel();
    },
  };
}

async function serve(src: ReturnType<typeof makeSource>, cursor?: number) {
  const sent: WireFrame[] = [];
  const unsubscribe = await serveResumableStream(src.source, cursor, (f) =>
    sent.push(f),
  );
  return { sent, unsubscribe };
}

test("fresh connect: sync with the snapshot (turnId included), then live frames", async () => {
  const src = makeSource();
  src.publish({ ...user("hi"), turnId: "t-1" }); // 1
  src.publish({ ...text("Hel"), turnId: "t-1" }); // 2
  const { sent } = await serve(src);
  src.publish({ ...text("lo"), turnId: "t-1" }); // 3
  expect(sent[0]).toEqual({
    type: "sync",
    data: { running: true, partial: "Hel", seq: 2, turnId: "t-1" },
    seq: 2,
  });
  expect(sent[1]).toEqual({ type: "text", data: "lo", seq: 3, turnId: "t-1" });
});

test("resume: replay + concurrently-published frames, no gap, no duplicate, no sync", async () => {
  // Delay the reads so live frames land in the stitch buffer mid-decision.
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const src = makeSource({ delayReads: () => gate });
  src.publish(user("q")); // 1
  src.publish(text("a")); // 2
  src.publish(text("b")); // 3

  const pending = serve(src, 1);
  // Published while replayAfter is still awaited: buffered by the stitch.
  src.publish(text("c")); // 4
  release();
  const { sent } = await pending;
  expect(sent.some((f) => f.type === "sync")).toBe(false);
  expect(sent.map((f) => f.seq)).toEqual([2, 3, 4]);
});

test("the stitch flush dedupes frames the replay already covered", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const src = makeSource({ delayReads: () => gate });
  src.publish(user("q")); // 1
  const pending = serve(src, 0);
  // Arrives live AND will be included in the replay read below → must be sent once.
  src.publish(text("a")); // 2
  release();
  const { sent } = await pending;
  expect(sent.map((f) => f.seq)).toEqual([1, 2]);
});

test("an unserviceable cursor gets a resync sync built from the snapshot", async () => {
  const src = makeSource();
  src.publish(user("q")); // 1
  src.publish({ type: "done", data: null }); // 2 → window cleared
  const { sent } = await serve(src, 1);
  expect(sent).toEqual([
    {
      type: "sync",
      data: { running: false, partial: "", seq: 2, resync: true },
      seq: 2,
    },
  ]);
});

test("after the flush, live frames flow in arrival order — a seq regression never starves the subscriber", async () => {
  const src = makeSource();
  src.publish(user("q")); // 1
  src.publish(text("long-lived")); // 2 … watermark 2
  const { sent } = await serve(src); // connected, watermark 2
  sent.length = 0;

  // The authority's state is lost (snapshot TTL expiry / conversation evicted):
  // a fresh channel restarts seq at 1 — BELOW this subscriber's watermark.
  src.resetChannel();
  src.publish(user("new world")); // seq 1
  src.publish(text("still delivered")); // seq 2
  expect(sent.map((f) => [f.seq, f.type])).toEqual([
    [1, "user"],
    [2, "text"],
  ]);
});

test("unsubscribe stops live delivery", async () => {
  const src = makeSource();
  const { sent, unsubscribe } = await serve(src);
  unsubscribe();
  src.publish(user("q"));
  expect(sent).toHaveLength(1); // just the sync
});
