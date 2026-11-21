import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";

const dataDir = mkdtempSync(join(tmpdir(), "houston-credhealth-"));
process.env.HOUSTON_DATA_DIR = dataDir;
const marksFile = join(dataDir, "provider-marks.json");

const {
  authFailureActive,
  clearProviderMarks,
  noteAuthFailure,
  noteQuotaExhausted,
  quotaExhaustedActive,
  resetAuthFailures,
} = await import("./credential-health");

afterEach(() => resetAuthFailures());

test("nothing marked → no failure, no IO needed", () => {
  expect(authFailureActive("anthropic", "fp-a")).toBe(false);
});

test("a marked credential reads as failed while it is still in place", () => {
  noteAuthFailure("anthropic", "fp-a");
  expect(authFailureActive("anthropic", "fp-a")).toBe(true);
  expect(authFailureActive("anthropic", "fp-a")).toBe(true);
});

test("a credential change auto-heals the mark (re-login, fresh served token, pasted key)", () => {
  noteAuthFailure("anthropic", "fp-dead");
  expect(authFailureActive("anthropic", "fp-fresh")).toBe(false);
  expect(authFailureActive("anthropic", "fp-dead")).toBe(false);
});

test("a serve loop re-applying the SAME dead token does not heal the mark", () => {
  noteAuthFailure("openai-codex", "fp-dead");
  expect(authFailureActive("openai-codex", "fp-dead")).toBe(true);
});

test("a clean turn clears the mark explicitly (the Keychain re-login no fingerprint can see)", () => {
  noteAuthFailure("anthropic", "fp-a");
  clearProviderMarks("anthropic");
  expect(authFailureActive("anthropic", "fp-a")).toBe(false);
});

test("marks are per provider", () => {
  noteAuthFailure("anthropic", "fp-a");
  expect(authFailureActive("openai-codex", "fp-a")).toBe(false);
});

test("an exhausted account is marked without an open-ended reset", () => {
  noteQuotaExhausted("minimax", null, "fp-a");
  expect(quotaExhaustedActive("minimax", "fp-a")).toBe(true);
  expect(authFailureActive("minimax", "fp-a")).toBe(false);
});

test("a quota mark lapses at the provider's own reset instant", () => {
  noteQuotaExhausted(
    "minimax",
    new Date(Date.now() - 1_000).toISOString(),
    "fp-a",
  );
  expect(quotaExhaustedActive("minimax", "fp-a")).toBe(false);
  noteQuotaExhausted(
    "minimax",
    new Date(Date.now() + 60_000).toISOString(),
    "fp-a",
  );
  expect(quotaExhaustedActive("minimax", "fp-a")).toBe(true);
});

test("an open-ended quota mark expires an hour later, not forever", () => {
  noteQuotaExhausted("minimax", null, "fp-a");
  vi.useFakeTimers();
  try {
    vi.setSystemTime(Date.now() + 61 * 60 * 1000);
    expect(quotaExhaustedActive("minimax", "fp-a")).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

test("a garbled reset hint falls back to the hour, never to 'never expires'", () => {
  noteQuotaExhausted("minimax", "whenever", "fp-a");
  expect(quotaExhaustedActive("minimax", "fp-a")).toBe(true);
  vi.useFakeTimers();
  try {
    vi.setSystemTime(Date.now() + 61 * 60 * 1000);
    expect(quotaExhaustedActive("minimax", "fp-a")).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

test("a changed credential heals a quota mark (a new account has its own balance)", () => {
  noteQuotaExhausted("minimax", null, "fp-old-key");
  expect(quotaExhaustedActive("minimax", "fp-new-key")).toBe(false);
  expect(quotaExhaustedActive("minimax", "fp-old-key")).toBe(false);
});

test("a clean turn clears BOTH marks at once", () => {
  noteAuthFailure("minimax", "fp-a");
  noteQuotaExhausted("minimax", null, "fp-a");
  clearProviderMarks("minimax");
  expect(authFailureActive("minimax", "fp-a")).toBe(false);
  expect(quotaExhaustedActive("minimax", "fp-a")).toBe(false);
});

test("marks survive a restart: a fresh module graph re-reads them from the data dir", async () => {
  noteAuthFailure("anthropic", "fp-dead");
  noteQuotaExhausted("minimax", null, "fp-broke");
  expect(existsSync(marksFile)).toBe(true);

  vi.resetModules();
  const restarted = await import("./credential-health");
  expect(restarted.authFailureActive("anthropic", "fp-dead")).toBe(true);
  expect(restarted.quotaExhaustedActive("minimax", "fp-broke")).toBe(true);
  expect(restarted.authFailureActive("anthropic", "fp-fresh")).toBe(false);
  restarted.resetAuthFailures();
  vi.resetModules();
});

test("a garbled marks file reads as 'nothing known', never as a crash", async () => {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(marksFile, "{not json");
  vi.resetModules();
  const restarted = await import("./credential-health");
  expect(restarted.authFailureActive("anthropic", "fp-a")).toBe(false);
  restarted.resetAuthFailures();
  vi.resetModules();
});
