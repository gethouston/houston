import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, expect, test, vi } from "vitest";
import type { HarnessSession } from "../backends/types";

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
const claude = { provider: "anthropic", id: "claude-sonnet-5" };

beforeEach(() => {
  resetAutocompactCooldownsForTest();
  vi.mocked(compactWithFactHarvest).mockReset();
  vi.mocked(compactWithFactHarvest).mockResolvedValue(undefined);
});

test("a successful compaction reports it compacted", async () => {
  await expect(runAutocompact(session, "c1", claude)).resolves.toBe(true);
  expect(compactWithFactHarvest).toHaveBeenCalledWith(session, "c1");
});

test("a caller's own cooldown store holds the retry instead of process memory", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  let held: number | undefined;
  const cooldown = {
    retryAfter: () => held,
    hold: (until: number) => {
      held = until;
    },
  };
  const now = 1_000_000;
  vi.mocked(compactWithFactHarvest).mockRejectedValueOnce(
    new Error("Summarization failed: the summarizer returned no summary"),
  );

  expect(await runAutocompact(session, "c1", claude, now, { cooldown })).toBe(
    false,
  );
  expect(held).toBe(now + AUTOCOMPACT_COOLDOWN_MS);
  expect(await runAutocompact(session, "c1", claude, now + 1_000)).toBe(true);
  expect(
    await runAutocompact(session, "c1", claude, now + 60_000, { cooldown }),
  ).toBe(false);
  expect(
    await runAutocompact(
      session,
      "c1",
      claude,
      now + AUTOCOMPACT_COOLDOWN_MS + 1,
      { cooldown },
    ),
  ).toBe(true);
});

test("a failed compaction resolves false instead of throwing", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(compactWithFactHarvest).mockRejectedValueOnce(
    new Error("Summarization failed: the summarizer returned no summary"),
  );

  await expect(runAutocompact(session, "c1", claude)).resolves.toBe(false);

  expect(error).toHaveBeenCalledWith(
    expect.stringContaining("compaction failed"),
    "Summarization failed: the summarizer returned no summary",
  );
  error.mockRestore();
});

test.each([
  [
    "openai-codex",
    "Summarization failed: Codex error: The 'gpt-5.4-mini' model is not supported when using Codex with a ChatGPT account.",
    "model_unavailable",
  ],
  [
    "openai-codex",
    'Summarization failed: 429: {"type":"FreeUsageLimitError","message":"Rate limit exceeded. Please try again later."}',
    "rate_limited",
  ],
  [
    "openai-codex",
    "Summarization failed: Codex error: The usage limit has been reached",
    "quota_exhausted",
  ],
  [
    "openai-compatible",
    "Summarization failed: Provider is not configured: openai-compatible",
    "unauthenticated",
  ],
  [
    "google",
    'Summarization failed: {"error":{"message":"{\n  "error": {\n    "code": 429,\n    "message": "You exceeded your current quota, please check your plan and billing details.", "status": "RESOURCE_EXHAUSTED"}}"}}',
    "quota_exhausted",
  ],
  [
    "openai-compatible",
    'Summarization failed: 400 {"type":"error","error":{"type":"invalid_request_error","message":"This endpoint\'s maximum context length is 128000 tokens. However, you requested about 140000 tokens"}}',
    "context_overflow",
  ],
])("a summarizer refusal that is the provider's own state is a warning, not an error (%s: %s)", async (provider, refusal, kind) => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.mocked(compactWithFactHarvest).mockRejectedValueOnce(new Error(refusal));

  expect(await runAutocompact(session, "c1", { provider, id: "m" })).toBe(
    false,
  );

  expect(error).not.toHaveBeenCalled();
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining(`provider refused (kind=${kind})`),
    refusal,
  );
  error.mockRestore();
  warn.mockRestore();
});

test("a failure is reported ONCE, not on every later turn", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(compactWithFactHarvest).mockRejectedValue(new Error("boom"));
  const now = 1_000_000;

  expect(await runAutocompact(session, "c1", claude, now)).toBe(false);
  expect(await runAutocompact(session, "c1", claude, now + 1_000)).toBe(false);
  expect(await runAutocompact(session, "c1", claude, now + 60_000)).toBe(false);

  expect(compactWithFactHarvest).toHaveBeenCalledTimes(1);
  expect(error).toHaveBeenCalledTimes(1);
  error.mockRestore();
});

test("the cooldown expires, so a transient refusal costs one cycle", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(compactWithFactHarvest).mockRejectedValueOnce(new Error("429"));
  const now = 1_000_000;

  expect(await runAutocompact(session, "c1", claude, now)).toBe(false);
  expect(
    await runAutocompact(
      session,
      "c1",
      claude,
      now + AUTOCOMPACT_COOLDOWN_MS + 1,
    ),
  ).toBe(true);
  expect(compactWithFactHarvest).toHaveBeenCalledTimes(2);
  error.mockRestore();
});

test("one conversation's cooldown never holds another one back", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(compactWithFactHarvest).mockRejectedValueOnce(new Error("boom"));
  const now = 1_000_000;

  expect(await runAutocompact(session, "c1", claude, now)).toBe(false);
  expect(await runAutocompact(session, "c2", claude, now)).toBe(true);
  error.mockRestore();
});

test("a session too small to summarize is noted, never reported as a fault", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.mocked(compactWithFactHarvest).mockRejectedValueOnce(
    new Error("Nothing to compact (session too small)"),
  );

  expect(await runAutocompact(session, "c1", claude)).toBe(false);

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
