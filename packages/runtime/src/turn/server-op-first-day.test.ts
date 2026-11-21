import { buildFirstDayPrompt, firstDayBrief } from "@houston/domain";
import { newSetupTask } from "@houston/host/src/routes/agent-first-day-turn";
import { encodeAutoContinue } from "@houston/protocol";
import { expect, test, vi } from "vitest";
import { AGENT, opWorker } from "./server-op-conversation.test-support";

test("first-day prepares the pod task and hidden turn without writing the board or config", async () => {
  const { pool, post } = await opWorker();
  const config = {
    firstDay: "pending" as const,
    provider: "openai-codex" as const,
    model: "gpt-5",
    arrival: "created" as const,
  };
  const brief = "# Probe\n\nA research assistant.\n";
  pool.put(`${AGENT}/CLAUDE.md`, brief);
  pool.put(`${AGENT}/.houston/config/config.json`, JSON.stringify(config));
  const uuid = vi
    .spyOn(crypto, "randomUUID")
    .mockReturnValue("00000000-0000-0000-0000-000000000001");
  try {
    const expected = newSetupTask(
      { author: undefined },
      { locale: "es", title: "Start" },
      config,
    );
    const out = await post({
      kind: "first-day",
      body: '{"locale":"es","title":"Start"}',
    });
    expect(out.status, JSON.stringify(out)).toBe(200);
    const plan = JSON.parse(out.body ?? "null");
    expect(plan.config).toMatchObject(config);
    expect(plan.task).toMatchObject({
      ...expected,
      updated_at: expect.any(String),
    });
    expect(plan.text).toBe(
      encodeAutoContinue(
        buildFirstDayPrompt("Probe", "es", firstDayBrief(brief)),
      ),
    );
    expect(plan.role).toBe(firstDayBrief(brief)?.role ?? null);
    expect(pool.writes).toEqual([]);
    expect(pool.transcripts).toEqual([]);
  } finally {
    uuid.mockRestore();
  }
});

test("first-day uses the host input validation", async () => {
  const { pool, post } = await opWorker();
  const out = await post({
    kind: "first-day",
    body: JSON.stringify({ title: "x".repeat(201) }),
  });
  expect(out.status).toBe(400);
  expect(pool.writes).toEqual([]);
});

test.each([
  "{",
  "null",
])("a body the pod cannot read (%s) answers 400, never a worker failure", async (body) => {
  const { pool, post } = await opWorker();
  const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const out = await post({ kind: "first-day", body });
  expect(out.status, JSON.stringify(out)).toBe(400);
  expect(JSON.parse(out.body ?? "null")).toEqual({
    error: "invalid JSON body",
  });
  expect(pool.writes).toEqual([]);
  expect(error).not.toHaveBeenCalled();
});
