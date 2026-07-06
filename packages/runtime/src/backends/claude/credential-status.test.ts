import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import {
  anthropicCredentialCached,
  logoutAnthropicCredential,
  refreshAnthropicCredential,
  resetAnthropicCredentialCache,
} from "./credential-status";
import { claudeCredentialsFile } from "./paths";

afterEach(() => {
  resetAnthropicCredentialCache(false);
  vi.restoreAllMocks();
});

/** Point HOUSTON_HOME (and thus claudeCredentialsFile) at a throwaway dir. */
function withHoustonHome(fn: (credFile: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "claude-cred-"));
  const prev = process.env.HOUSTON_HOME;
  process.env.HOUSTON_HOME = dir;
  try {
    fn(claudeCredentialsFile());
  } finally {
    if (prev === undefined) delete process.env.HOUSTON_HOME;
    else process.env.HOUSTON_HOME = prev;
    rmSync(dir, { recursive: true, force: true });
  }
}

async function withHoustonHomeAsync(
  fn: (credFile: string) => Promise<void>,
): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "claude-cred-"));
  const prev = process.env.HOUSTON_HOME;
  process.env.HOUSTON_HOME = dir;
  try {
    await fn(claudeCredentialsFile());
  } finally {
    if (prev === undefined) delete process.env.HOUSTON_HOME;
    else process.env.HOUSTON_HOME = prev;
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeCredFile(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({ claudeAiOauth: { accessToken: "sk-ant-oat01-x" } }),
  );
}

test("a logged-in probe warms the cache", async () => {
  resetAnthropicCredentialCache(false);
  expect(await refreshAnthropicCredential(async () => true)).toBe(true);
  expect(anthropicCredentialCached()).toBe(true);
});

test("a logged-out probe reads as not connected", async () => {
  resetAnthropicCredentialCache(true);
  expect(await refreshAnthropicCredential(async () => false)).toBe(false);
  expect(anthropicCredentialCached()).toBe(false);
});

test("a failing probe reads as NOT connected and logs the reason (no silent failure)", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  resetAnthropicCredentialCache(true);
  const got = await refreshAnthropicCredential(async () => {
    throw new Error("claude spawn failed");
  });
  expect(got).toBe(false);
  expect(anthropicCredentialCached()).toBe(false);
  expect(warn).toHaveBeenCalled();
});

test("rapid refreshes coalesce to ONE probe within the TTL (no subprocess spam)", async () => {
  resetAnthropicCredentialCache(false);
  let calls = 0;
  const probe = async () => {
    calls += 1;
    return true;
  };
  // Two back-to-back refreshes: the second reuses the fresh result.
  await refreshAnthropicCredential(probe);
  await refreshAnthropicCredential(probe);
  expect(calls).toBe(1);
});

test("force bypasses the TTL and re-probes", async () => {
  resetAnthropicCredentialCache(false);
  let calls = 0;
  const probe = async () => {
    calls += 1;
    return true;
  };
  await refreshAnthropicCredential(probe);
  await refreshAnthropicCredential(probe, { force: true });
  expect(calls).toBe(2);
});

test("concurrent refreshes share one in-flight probe", async () => {
  resetAnthropicCredentialCache(false);
  let calls = 0;
  const probe = async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 10));
    return true;
  };
  await Promise.all([
    refreshAnthropicCredential(probe),
    refreshAnthropicCredential(probe),
    refreshAnthropicCredential(probe),
  ]);
  expect(calls).toBe(1);
});

test("the materialized credentials file short-circuits the sync signal (pod path)", () => {
  withHoustonHome((credFile) => {
    resetAnthropicCredentialCache(false); // probe cache = not connected
    expect(anthropicCredentialCached()).toBe(false); // no file yet
    writeCredFile(credFile);
    // File present => connected WITHOUT any probe (the pod's instant signal).
    expect(anthropicCredentialCached()).toBe(true);
  });
});

test("logout removes the materialized file so the signal flips off", async () => {
  await withHoustonHomeAsync(async (credFile) => {
    writeCredFile(credFile);
    expect(anthropicCredentialCached()).toBe(true);
    // No bundled `claude` on PATH here => logout's ENOENT branch still runs the
    // file removal + cache reset.
    await logoutAnthropicCredential().catch(() => {});
    expect(anthropicCredentialCached()).toBe(false);
  });
});
