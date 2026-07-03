import type { Server } from "node:http";
import { expect, test } from "vitest";
import { config } from "../config";
import { evict, publish } from "../session/bus";
import { createRuntimeServer } from "./server";

/**
 * The resumable conversation events stream over real HTTP: fresh connects get
 * a sync + live frames; a resume cursor (`?after=` / `Last-Event-ID`) replays
 * the in-flight turn's missed frames with no gap and no duplicate; a cursor
 * the buffer can't serve degrades to a `resync` sync. SSE `id:` lines carry
 * each frame's seq (the EventSource resume affordance).
 */

let counter = 0;
const freshId = () => `events-route-conv-${counter++}`;

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string")
        throw new Error("test server did not bind a TCP port");
      resolve(`http://127.0.0.1:${addr.port}`);
    });
  });
}

const authHeaders = (extra?: Record<string, string>) => ({
  ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
  ...extra,
});

interface Frame {
  type: string;
  data: unknown;
  seq?: number;
  /** The SSE `id:` line accompanying the frame, if any. */
  id?: string;
}

/** Connect to the stream and collect parsed frames until `count` arrive. */
async function collectFrames(res: Response, count: number): Promise<Frame[]> {
  if (!res.body) throw new Error("expected an SSE body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const frames: Frame[] = [];
  let buf = "";
  while (frames.length < count) {
    const { done, value } = await reader.read();
    if (done) throw new Error(`stream ended after ${frames.length} frames`);
    buf += decoder.decode(value, { stream: true });
    let sep = buf.indexOf("\n\n");
    while (sep >= 0) {
      const block = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      sep = buf.indexOf("\n\n");
      const dataLine = block.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) continue; // ": connected" / ": hb"
      const idLine = block.split("\n").find((l) => l.startsWith("id: "));
      frames.push({
        ...(JSON.parse(dataLine.slice(6)) as Frame),
        ...(idLine ? { id: idLine.slice(4) } : {}),
      });
    }
  }
  await reader.cancel();
  return frames;
}

async function withServer(
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createRuntimeServer();
  const baseUrl = await listen(server);
  try {
    await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

test("fresh subscribe: sync (watermark + id line), then sequenced live frames", async () => {
  const id = freshId();
  await withServer(async (base) => {
    publish(id, { type: "user", data: { content: "hi", ts: 1 } });
    publish(id, { type: "text", data: "Hel" });
    const res = await fetch(`${base}/conversations/${id}/events`, {
      headers: authHeaders(),
    });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const pending = collectFrames(res, 2);
    publish(id, { type: "text", data: "lo" });
    const frames = await pending;
    expect(frames[0]).toEqual({
      type: "sync",
      data: { running: true, partial: "Hel", seq: 2 },
      seq: 2,
      id: "2",
    });
    expect(frames[1]).toEqual({
      type: "text",
      data: "lo",
      seq: 3,
      id: "3",
    });
  });
});

test("resume replay: no sync, missed frames + live frames with no gap and no duplicate", async () => {
  const id = freshId();
  await withServer(async (base) => {
    publish(id, { type: "user", data: { content: "q", ts: 1 } }); // 1
    publish(id, { type: "text", data: "a" }); // 2
    publish(id, { type: "text", data: "b" }); // 3
    const res = await fetch(`${base}/conversations/${id}/events?after=1`, {
      headers: authHeaders(),
    });
    // Publish concurrently with the replay flush: still exactly-once, in order.
    publish(id, { type: "text", data: "c" }); // 4
    publish(id, { type: "done", data: null }); // 5
    const frames = await collectFrames(res, 4);
    expect(frames.some((f) => f.type === "sync")).toBe(false);
    expect(frames.map((f) => [f.seq, f.data])).toEqual([
      [2, "a"],
      [3, "b"],
      [4, "c"],
      [5, null],
    ]);
  });
});

test("a cursor already at the watermark replays nothing and streams live", async () => {
  const id = freshId();
  await withServer(async (base) => {
    publish(id, { type: "user", data: { content: "q", ts: 1 } }); // 1
    const res = await fetch(`${base}/conversations/${id}/events?after=1`, {
      headers: authHeaders(),
    });
    publish(id, { type: "text", data: "live" }); // 2
    const frames = await collectFrames(res, 1);
    expect(frames).toEqual([{ type: "text", data: "live", seq: 2, id: "2" }]);
  });
});

test("a cursor ahead of the watermark resyncs (engine restarted)", async () => {
  const id = freshId();
  await withServer(async (base) => {
    const res = await fetch(`${base}/conversations/${id}/events?after=99`, {
      headers: authHeaders(),
    });
    const frames = await collectFrames(res, 1);
    expect(frames[0]).toEqual({
      type: "sync",
      data: { running: false, partial: "", seq: 0, resync: true },
      seq: 0,
      id: "0",
    });
  });
});

test("a cursor from inside a finished turn resyncs (buffer cleared at the terminal frame)", async () => {
  const id = freshId();
  await withServer(async (base) => {
    publish(id, { type: "user", data: { content: "q", ts: 1 } }); // 1
    publish(id, { type: "text", data: "answer" }); // 2
    publish(id, { type: "done", data: null }); // 3 → buffer cleared
    const res = await fetch(`${base}/conversations/${id}/events?after=1`, {
      headers: authHeaders(),
    });
    const frames = await collectFrames(res, 1);
    expect(frames[0]).toEqual({
      type: "sync",
      data: { running: false, partial: "", seq: 3, resync: true },
      seq: 3,
      id: "3",
    });
  });
});

test("Last-Event-ID resumes like ?after=, and the query wins when both are sent", async () => {
  const id = freshId();
  await withServer(async (base) => {
    publish(id, { type: "user", data: { content: "q", ts: 1 } }); // 1
    publish(id, { type: "text", data: "a" }); // 2
    publish(id, { type: "text", data: "b" }); // 3

    // Header alone: replay after seq 1.
    const viaHeader = await fetch(`${base}/conversations/${id}/events`, {
      headers: authHeaders({ "Last-Event-ID": "1" }),
    });
    expect((await collectFrames(viaHeader, 2)).map((f) => f.seq)).toEqual([
      2, 3,
    ]);

    // Query beats a contradicting header.
    const both = await fetch(`${base}/conversations/${id}/events?after=2`, {
      headers: authHeaders({ "Last-Event-ID": "0" }),
    });
    const frames = await collectFrames(both, 1);
    expect(frames).toEqual([{ type: "text", data: "b", seq: 3, id: "3" }]);
  });
});

test("turnId rides the wire: sync data names the running turn, live frames carry the envelope id", async () => {
  const id = freshId();
  await withServer(async (base) => {
    publish(id, {
      type: "user",
      data: { content: "hi", ts: 1 },
      turnId: "t-42",
    });
    const res = await fetch(`${base}/conversations/${id}/events`, {
      headers: authHeaders(),
    });
    const pending = collectFrames(res, 2);
    publish(id, { type: "text", data: "live", turnId: "t-42" });
    const frames = await pending;
    expect(frames[0]).toEqual({
      type: "sync",
      data: { running: true, partial: "", seq: 1, turnId: "t-42" },
      seq: 1,
      id: "1",
    });
    expect(frames[1]).toEqual({
      type: "text",
      data: "live",
      seq: 2,
      turnId: "t-42",
      id: "2",
    });
  });
});

test("a connected subscriber survives a seq regression (evicted conversation) — dedupe is stitch-window only", async () => {
  const id = freshId();
  await withServer(async (base) => {
    publish(id, { type: "user", data: { content: "q", ts: 1 } }); // 1
    publish(id, { type: "text", data: "old" }); // 2
    const res = await fetch(`${base}/conversations/${id}/events`, {
      headers: authHeaders(),
    });
    const pending = collectFrames(res, 3); // sync + the 2 post-regression frames

    // The conversation is deleted and re-created: fresh channel, seq restarts
    // at 1 — BELOW the subscriber's watermark of 2. The frames must still
    // arrive (a lifetime seq gate would starve this stream forever).
    evict(id);
    publish(id, { type: "user", data: { content: "second life", ts: 2 } }); // 1
    publish(id, { type: "text", data: "delivered" }); // 2

    const frames = await pending;
    expect(frames[0]?.type).toBe("sync");
    expect(frames.slice(1).map((f) => [f.seq, f.type])).toEqual([
      [1, "user"],
      [2, "text"],
    ]);
  });
});

test("DELETE /conversations/:id evicts the event channel — an outstanding cursor resyncs", async () => {
  const id = freshId();
  await withServer(async (base) => {
    // A real transcript on disk so the DELETE route reports 200.
    const { appendUserMessage } = await import("../store/conversations");
    appendUserMessage(id, "hello");
    publish(id, { type: "user", data: { content: "hello", ts: 1 } }); // 1
    publish(id, { type: "text", data: "answer" }); // 2

    const del = await fetch(`${base}/conversations/${id}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(del.status).toBe(200);

    // The deleted conversation's stream state is gone: a resume cursor from
    // before the delete cannot be served and degrades to a fresh resync.
    const res = await fetch(`${base}/conversations/${id}/events?after=2`, {
      headers: authHeaders(),
    });
    const frames = await collectFrames(res, 1);
    expect(frames[0]).toEqual({
      type: "sync",
      data: { running: false, partial: "", seq: 0, resync: true },
      seq: 0,
      id: "0",
    });
  });
});

test("a non-numeric or negative cursor is treated as absent (fresh sync)", async () => {
  const id = freshId();
  await withServer(async (base) => {
    publish(id, { type: "user", data: { content: "q", ts: 1 } }); // 1
    const res = await fetch(`${base}/conversations/${id}/events?after=-3`, {
      headers: authHeaders({ "Last-Event-ID": "bogus" }),
    });
    const frames = await collectFrames(res, 1);
    expect(frames[0]).toEqual({
      type: "sync",
      data: { running: true, partial: "", seq: 1 },
      seq: 1,
      id: "1",
    });
  });
});
