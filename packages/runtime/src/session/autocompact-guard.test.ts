import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, expect, test, vi } from "vitest";
import type { HarnessSession } from "../backends/types";

/**
 * The wedge this guard exists to prevent: compaction is a model call, the
 * context fill only drops when it SUCCEEDS, and a failure that propagates kills
 * the turn — so one refusal used to break every later turn of the conversation
 * at exactly the same step, with no way out for the user.
 */

process.env.HOUSTON_DATA_DIR = mkdtempSync(
  join(tmpdir(), "houston-autocompact-data-"),
);
process.env.HOUSTON_WORKSPACE_DIR = mkdtempSync(
  join(tmpdir(), "houston-autocompact-ws-"),
);

vi.mock("./durable-facts-harvest", () => ({
  compactWithFactHarvest: vi.fn(async () => {}),
}));

const { compactWithFactHarvest } = await import("./durable-facts-harvest");
const {
  AUTOCOMPACT_COOLDOWN_MS,
  isNothingToCompact,
  resetAutocompactCooldownsForTest,
  runAutocompact,
} = await import("./autocompact-guard");

const session = { dispose: () => {} } as unknown as HarnessSession;

beforeEach(() => {
  resetAutocompactCooldownsForTest();
  vi.mocked(compactWithFactHarvest).mockReset();
  vi.mocked(compactWithFactHarvest).mockResolvedValue(undefined);
});

test("a successful compaction reports it compacted", async () => {
  await expect(runAutocompact(session, "c1")).resolves.toBe(true);
  expect(compactWithFactHarvest).toHaveBeenCalledWith(session, "c1");
});

test("a failed compaction resolves false instead of throwing", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(compactWithFactHarvest).mockRejectedValueOnce(
    new Error("provider unreachable"),
  );

  await expect(runAutocompact(session, "c1")).resolves.toBe(false);

  // Never silent to us: console.error is the runtime's Sentry feed.
  expect(error).toHaveBeenCalledWith(
    expect.stringContaining("compaction failed"),
    "provider unreachable",
  );
  error.mockRestore();
});

test("a failure is reported ONCE, not on every later turn", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(compactWithFactHarvest).mockRejectedValue(new Error("boom"));
  const now = 1_000_000;

  expect(await runAutocompact(session, "c1", now)).toBe(false);
  // The later turns of a conversation whose fill stays over the threshold: the
  // summarization is not re-paid, and the log is not re-spammed.
  expect(await runAutocompact(session, "c1", now + 1_000)).toBe(false);
  expect(await runAutocompact(session, "c1", now + 60_000)).toBe(false);

  expect(compactWithFactHarvest).toHaveBeenCalledTimes(1);
  expect(error).toHaveBeenCalledTimes(1);
  error.mockRestore();
});

test("the cooldown expires, so a transient refusal costs one cycle", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(compactWithFactHarvest).mockRejectedValueOnce(new Error("429"));
  const now = 1_000_000;

  expect(await runAutocompact(session, "c1", now)).toBe(false);
  expect(
    await runAutocompact(session, "c1", now + AUTOCOMPACT_COOLDOWN_MS + 1),
  ).toBe(true);
  expect(compactWithFactHarvest).toHaveBeenCalledTimes(2);
  error.mockRestore();
});

test("one conversation's cooldown never holds another one back", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(compactWithFactHarvest).mockRejectedValueOnce(new Error("boom"));
  const now = 1_000_000;

  expect(await runAutocompact(session, "c1", now)).toBe(false);
  expect(await runAutocompact(session, "c2", now)).toBe(true);
  error.mockRestore();
});

test("a session too small to summarize is noted, never reported as a fault", async () => {
  // The ordinary state of a fresh chat (and of a session rebuilt under a fill
  // Houston still reads high) — an error here would train us to ignore errors.
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.mocked(compactWithFactHarvest).mockRejectedValueOnce(
    new Error("Nothing to compact (session too small)"),
  );

  expect(await runAutocompact(session, "c1")).toBe(false);

  expect(error).not.toHaveBeenCalled();
  expect(info).toHaveBeenCalledWith(
    expect.stringContaining("nothing to compact yet"),
    expect.stringContaining("session too small"),
  );
  error.mockRestore();
  info.mockRestore();
});

test("both backends' refusal sentence is recognized", () => {
  expect(isNothingToCompact("Nothing to compact (session too small)")).toBe(
    true,
  );
  expect(isNothingToCompact("nothing to compact")).toBe(true);
  expect(isNothingToCompact("rate limit exceeded")).toBe(false);
});
