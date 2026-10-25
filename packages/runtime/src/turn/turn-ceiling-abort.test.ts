import { rmSync } from "node:fs";
import { expect, test, vi } from "vitest";
import { realCeiling } from "./ceiling-real.test-support";

vi.mock("./turn-runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./turn-runtime")>()),
  createTurnModelRuntime: async () => ({
    modelRuntime: {},
    model: { provider: "openai-codex", id: "test", contextWindow: 128000 },
  }),
}));

test.each([
  false,
  true,
])("real pi wind-down suppresses abort and held retry errors before live forwarding and persistence (retry=%s)", async (retry) => {
  const { frames, pool } = await realCeiling({ retry });
  try {
    expect(frames.filter((f) => f.type === "provider_error")).toEqual([]);
    expect(
      frames.filter((f) => f.type === "error" || f.type === "done"),
    ).toEqual([
      expect.objectContaining({
        type: "error",
        data: expect.objectContaining({ code: "turn_time_limit" }),
      }),
    ]);
    const row = pool.transcripts.find((call) =>
      call.path.endsWith("/assistant"),
    );
    const message = JSON.parse(row?.body ?? "null").message;
    expect(message).toMatchObject({
      content: "Saved work",
      stopReason: "turn_time_limit",
    });
    expect(message.providerError).toBeUndefined();
    expect(message.pendingInteraction).toBeUndefined();
  } finally {
    rmSync(pool.root, { recursive: true, force: true });
  }
});

test("the real turn's heartbeat abort reason can be rethrown as an AbortError", async () => {
  let reason: unknown;
  const { pool } = await realCeiling({
    beforeAbort: (signal) => {
      try {
        signal?.throwIfAborted();
      } catch (error) {
        reason = error;
      }
    },
  });
  try {
    expect(reason).toBeInstanceOf(DOMException);
    expect(reason).toMatchObject({
      name: "AbortError",
      message: "turn_time_limit",
    });
  } finally {
    rmSync(pool.root, { recursive: true, force: true });
  }
});

test("wind-down reports stop-to-terminal and sync timing on the real outcome path", async () => {
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  const { pool } = await realCeiling();
  try {
    expect(log).toHaveBeenCalledWith(
      "[turn] wind_down",
      expect.objectContaining({
        turnId: "t",
        stopReason: "turn_time_limit",
        stopToTerminalMs: expect.any(Number),
        syncMs: expect.any(Number),
      }),
    );
    const detail = log.mock.calls.find(
      (args) => args[0] === "[turn] wind_down",
    )?.[1];
    expect(detail.stopToTerminalMs).toBeGreaterThanOrEqual(0);
    expect(detail.syncMs).toBeGreaterThanOrEqual(0);
    expect(detail.stopToTerminalMs).toBeGreaterThanOrEqual(detail.syncMs);
  } finally {
    log.mockRestore();
    rmSync(pool.root, { recursive: true, force: true });
  }
});

test("the real Claude turn winds down quietly with an AbortError and a saved marker", async () => {
  let reason: unknown;
  const { frames, pool } = await realCeiling({
    claude: true,
    beforeAbort: (signal) => {
      reason = signal?.reason;
    },
  });
  try {
    expect(reason).toBeInstanceOf(DOMException);
    expect(reason).toMatchObject({ name: "AbortError" });
    expect(frames.filter((f) => f.type === "provider_error")).toEqual([]);
    expect(
      frames.filter((f) => f.type === "done" || f.type === "error"),
    ).toEqual([
      expect.objectContaining({
        type: "error",
        data: expect.objectContaining({ code: "turn_time_limit" }),
      }),
    ]);
    const row = pool.transcripts.find((call) =>
      call.path.endsWith("/assistant"),
    );
    expect(JSON.parse(row?.body ?? "null").message).toMatchObject({
      content: "Saved work",
      stopReason: "turn_time_limit",
    });
  } finally {
    rmSync(pool.root, { recursive: true, force: true });
  }
});
