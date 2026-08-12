import type { SequencedFrame } from "@houston/runtime-client";
import { afterEach, expect, test } from "vitest";
import {
  startTestFetchServer,
  type TestFetchServer,
} from "../testing/fetch-server";
import { MemoryTurnBus } from "./bus";
import type { TurnLogSender } from "./frame-forwarder";
import { FrameForwarder } from "./frame-forwarder";
import { eventChannel } from "./relay-dialect";
import { HttpTurnLogSender } from "./turn-log-http";

let server: TestFetchServer | undefined;

afterEach(async () => {
  await server?.stop();
  server = undefined;
});

test("captures without a client, batches frames, and flushes terminal immediately", async () => {
  const requests: {
    path: string;
    frames: SequencedFrame[];
    headers: Headers;
  }[] = [];
  server = await startTestFetchServer(async (request) => {
    const body = (await request.json()) as { frames: SequencedFrame[] };
    requests.push({
      path: new URL(request.url).pathname,
      frames: body.frames,
      headers: request.headers,
    });
    return Response.json({ ok: true });
  });
  const bus = new MemoryTurnBus();
  const sender = new HttpTurnLogSender({
    gateway: {
      baseUrl: server.baseUrl,
      orgSlug: "acme",
      agentSlug: "helper",
      podToken: "pod-token",
      bootId: "boot-1",
      fence: { token: "71" },
    },
    retryDelaysMs: [],
  });
  const forwarder = new FrameForwarder({ bus, sender, batchMs: 10_000 });
  // No SSE/client subscriber exists: this unconditional capture is the only one.
  forwarder.capture("routine/c1", "helper/routine/c1");

  await bus.publish(
    eventChannel("helper/routine/c1"),
    JSON.stringify({ type: "text", data: { text: "a" }, seq: 41 }),
  );
  await bus.publish(
    eventChannel("helper/routine/c1"),
    JSON.stringify({ type: "done", data: {}, seq: 42 }),
  );
  await eventually(() => requests.length === 1);

  expect(requests[0]?.path).toBe("/v1/pod/turnlog/acme/helper/routine%2Fc1");
  expect(requests[0]?.frames.map((frame) => frame.seq)).toEqual([41, 42]);
  expect(requests[0]?.headers.get("authorization")).toBe("Bearer pod-token");
  expect(requests[0]?.headers.get("x-houston-fencing-token")).toBe("71");
  expect(requests[0]?.headers.get("x-houston-boot-id")).toBe("boot-1");
});

test("flushes a full 32-frame batch without waiting for the timer", async () => {
  const batches: SequencedFrame[][] = [];
  server = await startTestFetchServer(async (request) => {
    const body = (await request.json()) as { frames: SequencedFrame[] };
    batches.push(body.frames);
    return Response.json({ ok: true });
  });
  const bus = new MemoryTurnBus();
  const forwarder = new FrameForwarder({
    bus,
    sender: new HttpTurnLogSender({
      gateway: {
        baseUrl: server.baseUrl,
        orgSlug: "acme",
        agentSlug: "helper",
        podToken: "pod-token",
        bootId: "boot-1",
        fence: {},
      },
      retryDelaysMs: [],
    }),
    batchMs: 10_000,
  });
  forwarder.capture("c1", "helper/c1");

  for (let seq = 1; seq <= 32; seq++) {
    await bus.publish(
      eventChannel("helper/c1"),
      JSON.stringify({ type: "text", data: { text: String(seq) }, seq }),
    );
  }
  await eventually(() => batches.length === 1);
  expect(batches[0]).toHaveLength(32);
});

test("serializes consecutive turns for the same conversation", async () => {
  const batches: number[][] = [];
  let releaseFirst: (() => void) | undefined;
  const firstBlocked = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const sender: TurnLogSender = {
    async send(_conversationId, frames) {
      batches.push(frames.map((frame) => frame.seq));
      if (batches.length === 1) await firstBlocked;
    },
  };
  const bus = new MemoryTurnBus();
  const forwarder = new FrameForwarder({ bus, sender });

  forwarder.capture("c1", "helper/c1");
  await bus.publish(
    eventChannel("helper/c1"),
    JSON.stringify({ type: "done", data: {}, seq: 10 }),
  );
  await eventually(() => batches.length === 1);

  forwarder.capture("c1", "helper/c1");
  await bus.publish(
    eventChannel("helper/c1"),
    JSON.stringify({ type: "done", data: {}, seq: 11 }),
  );
  await new Promise((resolve) => setTimeout(resolve, 5));
  expect(batches).toEqual([[10]]);

  releaseFirst?.();
  await eventually(() => batches.length === 2);
  expect(batches).toEqual([[10], [11]]);
});

async function eventually(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("condition not reached");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
