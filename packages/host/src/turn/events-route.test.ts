import { createServer, type Server } from "node:http";
import type { WireFrame } from "@houston/runtime-client";
import { expect, test } from "vitest";
import { MemoryTurnBus } from "./bus";
import { serveConversationEvents } from "./events-route";
import { TurnRelay } from "./relay";

/**
 * The host's conversation events route over real HTTP: the same resume
 * contract as the runtime's route (shared stitch), plus the host-only
 * behavior — the dead-pump reaper runs at subscribe time, so a conversation
 * whose pump crashed is healed before the request is served.
 */

interface Frame {
  type: string;
  data: unknown;
  seq?: number;
  turnId?: string;
}

async function withRoute(
  relay: TurnRelay,
  agentId: string,
  key: string,
  fn: (base: string) => Promise<void>,
): Promise<void> {
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    void serveConversationEvents(relay, agentId, key, url, req, res);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  const base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  try {
    await fn(base);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
}

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
      if (dataLine) frames.push(JSON.parse(dataLine.slice(6)) as Frame);
    }
  }
  await reader.cancel();
  return frames;
}

/** Persist the crash-sim state: a running snapshot, no inflight lease. */
async function crashSim(bus: MemoryTurnBus, key: string) {
  await bus.set(
    `turn:snap2:${key}`,
    JSON.stringify({ running: true, partial: "half", seq: 5, turnId: "t-x" }),
    3600,
  );
}

test("fresh connect: sync (with watermark + running turnId), then live frames", async () => {
  const relay = new TurnRelay();
  let publishFrame!: (e: WireFrame) => Promise<void>;
  let finish!: () => void;
  await relay.start("a1", "a1/c1", async (publish) => {
    publishFrame = publish;
    await new Promise<void>((r) => (finish = r));
  });
  await publishFrame({
    type: "user",
    data: { content: "hi", ts: 1 },
    turnId: "t-1",
  });

  await withRoute(relay, "a1", "a1/c1", async (base) => {
    const res = await fetch(`${base}/events`);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("x-accel-buffering")).toBe("no");
    const pending = collectFrames(res, 2);
    await publishFrame({ type: "text", data: "live", turnId: "t-1" });
    const frames = await pending;
    expect(frames[0]).toEqual({
      type: "sync",
      data: { running: true, partial: "", seq: 1, turnId: "t-1" },
      seq: 1,
    });
    expect(frames[1]).toEqual({
      type: "text",
      data: "live",
      seq: 2,
      turnId: "t-1",
    });
  });
  finish();
});

test("resume replays the missed frames — no sync, no gap, no duplicate", async () => {
  const relay = new TurnRelay();
  let publishFrame!: (e: WireFrame) => Promise<void>;
  let finish!: () => void;
  await relay.start("a1", "a1/c1", async (publish) => {
    publishFrame = publish;
    await new Promise<void>((r) => (finish = r));
  });
  await publishFrame({ type: "user", data: { content: "q", ts: 1 } }); // 1
  await publishFrame({ type: "text", data: "a" }); // 2
  await publishFrame({ type: "text", data: "b" }); // 3

  await withRoute(relay, "a1", "a1/c1", async (base) => {
    const res = await fetch(`${base}/events?after=1`);
    const frames = await collectFrames(res, 2);
    expect(frames.some((f) => f.type === "sync")).toBe(false);
    expect(frames.map((f) => [f.seq, f.data])).toEqual([
      [2, "a"],
      [3, "b"],
    ]);
  });
  finish();
});

test("crash-sim: a fresh connect is served against the healed state (sync running:false)", async () => {
  const bus = new MemoryTurnBus();
  const relay = new TurnRelay(bus);
  await crashSim(bus, "a1/c1");
  await withRoute(relay, "a1", "a1/c1", async (base) => {
    const res = await fetch(`${base}/events`);
    const frames = await collectFrames(res, 1);
    // The reaper terminated the dead turn BEFORE the sync was built: no
    // stuck-forever spinner, the watermark advanced past the synthesized error.
    expect(frames[0]).toEqual({
      type: "sync",
      data: { running: false, partial: "", seq: 6 },
      seq: 6,
    });
  });
});

test("crash-sim: a resume parked at the dead turn's watermark receives the synthesized error frame", async () => {
  const bus = new MemoryTurnBus();
  const relay = new TurnRelay(bus);
  await crashSim(bus, "a1/c1");
  await withRoute(relay, "a1", "a1/c1", async (base) => {
    const res = await fetch(`${base}/events?after=5`);
    const frames = await collectFrames(res, 1);
    expect(frames[0]).toEqual({
      type: "error",
      data: { message: "The turn ended unexpectedly" },
      seq: 6,
      turnId: "t-x",
    });
  });
});
