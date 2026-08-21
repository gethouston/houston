import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";

// Fingerprints are injected everywhere, so these tests never touch auth.json
// or the Claude credential file — the module's IO is exercised implicitly by
// the fact that production callers omit the parameter. The data dir is pinned
// to a tmpdir before the dynamic imports because the marks are PERSISTED there
// (config reads HOUSTON_DATA_DIR at import time).
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
  // Still the same credential on a later poll — still failed.
  expect(authFailureActive("anthropic", "fp-a")).toBe(true);
});

test("a credential change auto-heals the mark (re-login, fresh served token, pasted key)", () => {
  noteAuthFailure("anthropic", "fp-dead");
  expect(authFailureActive("anthropic", "fp-fresh")).toBe(false);
  // The heal is permanent: even the old fingerprint no longer reads failed
  // (the mark was deleted, not merely bypassed).
  expect(authFailureActive("anthropic", "fp-dead")).toBe(false);
});

test("a serve loop re-applying the SAME dead token does not heal the mark", () => {
  // applyServedCredential rewrites auth.json with identical bytes → identical
  // fingerprint → the provider must stay disconnected (no status flapping).
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

// ---- out-of-credits marks ----

test("an exhausted account is marked without an open-ended reset", () => {
  noteQuotaExhausted("minimax", null, "fp-a");
  expect(quotaExhaustedActive("minimax", "fp-a")).toBe(true);
  // Independent of the auth mark: the credential still authenticates.
  expect(authFailureActive("minimax", "fp-a")).toBe(false);
});

test("a quota mark lapses at the provider's own reset instant", () => {
  noteQuotaExhausted(
    "minimax",
    new Date(Date.now() - 1_000).toISOString(),
    "fp-a",
  );
  expect(quotaExhaustedActive("minimax", "fp-a")).toBe(false);
  // A reset still ahead of us keeps the account marked.
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

// ---- persistence ----

test("marks survive a restart: a fresh module graph re-reads them from the data dir", async () => {
  noteAuthFailure("anthropic", "fp-dead");
  noteQuotaExhausted("minimax", null, "fp-broke");
  expect(existsSync(marksFile)).toBe(true);

  // A restarted pod is a fresh module graph over the SAME data dir. Without
  // persistence it would report the dead token as connected until the next
  // failing turn (PRODUCT-1475).
  vi.resetModules();
  const restarted = await import("./credential-health");
  expect(restarted.authFailureActive("anthropic", "fp-dead")).toBe(true);
  expect(restarted.quotaExhaustedActive("minimax", "fp-broke")).toBe(true);
  // And a credential changed while the process was down still auto-heals.
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
