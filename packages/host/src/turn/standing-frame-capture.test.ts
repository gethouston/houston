import { afterEach, expect, test, vi } from "vitest";
import { MemoryTurnBus } from "./bus";
import type { FrameForwarder } from "./frame-forwarder";
import { StandingFrameCapture } from "./standing-frame-capture";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("capture resolves only after the SSE body has a live reader", async () => {
  let streamController!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body)),
  );
  const forwarder = {
    capture: vi.fn(),
    release: vi.fn(),
  } as unknown as FrameForwarder;
  const capture = new StandingFrameCapture(new MemoryTurnBus(), forwarder);

  await capture.capture(
    { baseUrl: "https://runtime.example", token: "runtime-token" },
    "agent-1",
    "c1",
  );

  expect(body.locked).toBe(true);
  capture.stopCapture("agent-1", "c1");
  streamController.close();
});

test("capture rejects and releases state when SSE attach fails", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("missing", { status: 404 })),
  );
  vi.spyOn(console, "debug").mockImplementation(() => {});
  const forwarder = {
    capture: vi.fn(),
    release: vi.fn(),
  } as unknown as FrameForwarder;
  const capture = new StandingFrameCapture(new MemoryTurnBus(), forwarder);

  await expect(
    capture.capture(
      { baseUrl: "https://runtime.example", token: "runtime-token" },
      "agent-1",
      "c1",
    ),
  ).rejects.toThrow("runtime events failed (404)");
  await vi.waitFor(() =>
    expect(forwarder.release).toHaveBeenCalledWith("agent-1/c1"),
  );
});
