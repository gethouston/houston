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
  "sync",
  "publish",
] as const)("a stop first learned during %s keeps the real loop's natural finish and pending interaction", async (stopDuring) => {
  const { frames, pool } = await realCeiling({ stopDuring });
  try {
    const terminals = frames.filter(
      (f) => f.type === "error" || f.type === "done",
    );
    expect(terminals).toHaveLength(1);
    expect(terminals[0]).toMatchObject({
      type: "done",
      pendingInteraction: {
        steps: [expect.objectContaining({ kind: "plan_ready" })],
      },
    });
    const row = pool.transcripts.find((call) =>
      call.path.endsWith("/assistant"),
    );
    const message = JSON.parse(row?.body ?? "null").message;
    expect(message.stopReason).toBeUndefined();
    expect(message.pendingInteraction).toMatchObject({
      steps: [expect.objectContaining({ kind: "plan_ready" })],
    });
  } finally {
    rmSync(pool.root, { recursive: true, force: true });
  }
});

test.each([
  "sync",
  "publish",
] as const)("Claude keeps its natural finish when the first stop arrives during %s", async (stopDuring) => {
  const { frames, pool } = await realCeiling({ claude: true, stopDuring });
  try {
    expect(
      frames.filter((f) => f.type === "error" || f.type === "done"),
    ).toEqual([
      expect.objectContaining({
        type: "done",
        pendingInteraction: expect.objectContaining({
          steps: [expect.objectContaining({ kind: "plan_ready" })],
        }),
      }),
    ]);
    const row = pool.transcripts.find((call) =>
      call.path.endsWith("/assistant"),
    );
    expect(JSON.parse(row?.body ?? "null").message.stopReason).toBeUndefined();
  } finally {
    rmSync(pool.root, { recursive: true, force: true });
  }
});

test("a stop during the hidden follow-up pass keeps a non-plan turn's natural finish", async () => {
  const { frames, pool, followUpCalls } = await realCeiling({
    stopDuring: "follow_up",
  });
  try {
    expect(followUpCalls).toBe(1);
    expect(
      frames.filter((f) => f.type === "error" || f.type === "done"),
    ).toEqual([expect.objectContaining({ type: "done" })]);
    const row = pool.transcripts.find((call) =>
      call.path.endsWith("/assistant"),
    );
    expect(JSON.parse(row?.body ?? "null").message.stopReason).toBeUndefined();
  } finally {
    rmSync(pool.root, { recursive: true, force: true });
  }
});
