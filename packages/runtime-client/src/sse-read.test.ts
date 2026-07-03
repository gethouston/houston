import { expect, test } from "vitest";
import { readEventStream } from "./sse-read";
import type { WireFrame } from "./types";

const encoder = new TextEncoder();

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

test("parses data frames, skips comments/heartbeats, fires onActivity per chunk", async () => {
  const frames: WireFrame[] = [];
  let activity = 0;
  await readEventStream(
    streamOf(
      ": connected\n\n",
      'id: 1\ndata: {"type":"text","data":"a","seq":1}\n\n: hb\n\n',
      'data: {"type":"done","data":null,"seq":2,"turnId":"t-1"}\n\n',
    ),
    (f) => {
      frames.push(f);
    },
    () => {
      activity++;
    },
  );
  expect(frames).toEqual([
    { type: "text", data: "a", seq: 1 },
    { type: "done", data: null, seq: 2, turnId: "t-1" },
  ]);
  expect(activity).toBe(3);
});

test("an async onEvent is awaited before the next frame is parsed (ordering)", async () => {
  const order: string[] = [];
  await readEventStream(
    streamOf(
      'data: {"type":"text","data":"a","seq":1}\n\n',
      'data: {"type":"text","data":"b","seq":2}\n\n',
    ),
    async (f) => {
      order.push(`start:${f.seq}`);
      await new Promise((r) => setTimeout(r, 5));
      order.push(`end:${f.seq}`);
    },
  );
  expect(order).toEqual(["start:1", "end:1", "start:2", "end:2"]);
});

test("a malformed data line rejects — a garbled stream must surface", async () => {
  await expect(
    readEventStream(streamOf("data: {not json}\n\n"), () => {}),
  ).rejects.toThrow();
});

test("tolerant mode reports a malformed line and skips it, keeping later frames", async () => {
  const frames: WireFrame[] = [];
  const bad: Array<[string, unknown]> = [];
  await readEventStream(
    streamOf(
      'data: {"type":"text","data":"a","seq":1}\n\n',
      "data: {not json}\n\n",
      'data: {"type":"done","data":null,"seq":2}\n\n',
    ),
    (f) => {
      frames.push(f);
    },
    undefined,
    { onParseError: (line, err) => bad.push([line, err]) },
  );
  expect(frames).toEqual([
    { type: "text", data: "a", seq: 1 },
    { type: "done", data: null, seq: 2 },
  ]);
  expect(bad).toHaveLength(1);
  expect(bad[0]?.[0]).toBe("{not json}");
  expect(bad[0]?.[1]).toBeInstanceOf(Error);
});
