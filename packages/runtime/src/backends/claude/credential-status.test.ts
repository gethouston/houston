import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import type { CredentialProbe } from "./credential-status";
import {
  anthropicCredentialCached,
  logoutAnthropicCredential,
  refreshAnthropicCredential,
  resetAnthropicCredentialCache,
} from "./credential-status";
import { claudeCredentialsFile } from "./paths";

afterEach(() => {
  resetAnthropicCredentialCache(false);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** A probe that ANSWERS (the only kind that may move the cache). */
const answers = (loggedIn: boolean): CredentialProbe => {
  return async () => ({ known: true, loggedIn });
};

/** A probe that counts its spawns, so TTL/backoff assertions are exact. */
function countingProbe(answer: Awaited<ReturnType<CredentialProbe>>): {
  probe: CredentialProbe;
  calls: () => number;
} {
  let calls = 0;
  return {
    probe: async () => {
      calls += 1;
      return answer;
    },
    calls: () => calls,
  };
}

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
  expect(await refreshAnthropicCredential(answers(true))).toBe(true);
  expect(anthropicCredentialCached()).toBe(true);
});

test("a probe that ANSWERS logged-out reads as not connected", async () => {
  resetAnthropicCredentialCache(true);
  expect(await refreshAnthropicCredential(answers(false))).toBe(false);
  expect(anthropicCredentialCached()).toBe(false);
});

test("a THROWING probe keeps the last known answer (a broken probe is not a sign-out)", async () => {
  // The flapping bug: `claude auth status` failing to run said "not connected"
  // with full confidence, so a signed-in user watched the card turn into
  // "Connect Anthropic" mid-session. A failure to ASK is not an answer.
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  resetAnthropicCredentialCache(true);
  const got = await refreshAnthropicCredential(async () => {
    throw new Error("claude spawn failed");
  });
  expect(got).toBe(true);
  expect(anthropicCredentialCached()).toBe(true);
  expect(warn).toHaveBeenCalled();
});

test("an UNKNOWN answer keeps the last known value and logs the reason", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  resetAnthropicCredentialCache(true);
  const got = await refreshAnthropicCredential(async () => ({
    known: false,
    reason: "timeout",
  }));
  expect(got).toBe(true);
  expect(anthropicCredentialCached()).toBe(true);
  expect(warn.mock.calls[0]?.[0]).toContain("timeout");
});

test("an unknown answer never INVENTS a connection either (disconnected stays disconnected)", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  resetAnthropicCredentialCache(false);
  const got = await refreshAnthropicCredential(async () => ({
    known: false,
    reason: "ENOENT",
  }));
  expect(got).toBe(false);
  expect(anthropicCredentialCached()).toBe(false);
});

test("rapid refreshes coalesce to ONE probe within the TTL (no subprocess spam)", async () => {
  resetAnthropicCredentialCache(false);
  const { probe, calls } = countingProbe({ known: true, loggedIn: true });
  // Two back-to-back refreshes: the second reuses the fresh result.
  await refreshAnthropicCredential(probe);
  await refreshAnthropicCredential(probe);
  expect(calls()).toBe(1);
});

test("a CONNECTED answer is reused for 30s; a stale one re-probes", async () => {
  vi.useFakeTimers();
  resetAnthropicCredentialCache(false);
  const { probe, calls } = countingProbe({ known: true, loggedIn: true });
  await refreshAnthropicCredential(probe);
  expect(calls()).toBe(1);
  vi.advanceTimersByTime(5_000);
  await refreshAnthropicCredential(probe);
  expect(calls()).toBe(1); // connected is stable: no subprocess per poll
  vi.advanceTimersByTime(31_000);
  await refreshAnthropicCredential(probe);
  expect(calls()).toBe(2);
});

test("a DISCONNECTED answer re-probes within seconds (sign-in must flip fast)", async () => {
  vi.useFakeTimers();
  resetAnthropicCredentialCache(true);
  const { probe, calls } = countingProbe({ known: true, loggedIn: false });
  await refreshAnthropicCredential(probe);
  expect(calls()).toBe(1);
  vi.advanceTimersByTime(3_000);
  await refreshAnthropicCredential(probe);
  expect(calls()).toBe(2);
});

test("an unknown answer backs off: polls within 15s spawn nothing, force still probes", async () => {
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  resetAnthropicCredentialCache(true);
  const { probe, calls } = countingProbe({ known: false, reason: "timeout" });
  // /providers and /providers/usage both refresh on every poll cycle; a broken
  // probe must not mean a subprocess per request.
  await refreshAnthropicCredential(probe);
  vi.advanceTimersByTime(5_000);
  await refreshAnthropicCredential(probe);
  vi.advanceTimersByTime(5_000);
  expect(await refreshAnthropicCredential(probe)).toBe(true); // last known
  expect(calls()).toBe(1);
  // A login/logout route forces the question regardless of the backoff.
  await refreshAnthropicCredential(probe, { force: true });
  expect(calls()).toBe(2);
  // And the throttle expires on its own, on the backoff's own clock (the forced
  // probe above re-armed it).
  vi.advanceTimersByTime(16_000);
  await refreshAnthropicCredential(probe);
  expect(calls()).toBe(3);
});

test("an unknown answer arms ONLY the backoff — the TTL clock keeps timing the last real answer", async () => {
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  // Primed connected (the 30s TTL), then the probe stops answering.
  resetAnthropicCredentialCache(true);
  const { probe, calls } = countingProbe({ known: false, reason: "timeout" });
  await refreshAnthropicCredential(probe);
  expect(calls()).toBe(1);
  vi.advanceTimersByTime(16_000);
  await refreshAnthropicCredential(probe);
  // Stamping the TTL clock on a NON-answer used to stack the two knobs: the 15s
  // backoff expired but the 30s connected TTL then blocked the retry, so a
  // recovered probe stayed unasked for twice as long as the backoff promises.
  expect(calls()).toBe(2);
});

test("the backoff outlasts the 2s disconnected TTL, so a broken probe isn't re-spawned per poll", async () => {
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  resetAnthropicCredentialCache(false);
  const { probe, calls } = countingProbe({ known: false, reason: "no output" });
  await refreshAnthropicCredential(probe);
  vi.advanceTimersByTime(3_000); // past the disconnected TTL…
  await refreshAnthropicCredential(probe);
  expect(calls()).toBe(1); // …but inside the backoff
  vi.advanceTimersByTime(13_000);
  await refreshAnthropicCredential(probe);
  expect(calls()).toBe(2);
});

test("force bypasses the TTL and re-probes", async () => {
  resetAnthropicCredentialCache(false);
  const { probe, calls } = countingProbe({ known: true, loggedIn: true });
  await refreshAnthropicCredential(probe);
  await refreshAnthropicCredential(probe, { force: true });
  expect(calls()).toBe(2);
});

test("concurrent refreshes share one in-flight probe", async () => {
  resetAnthropicCredentialCache(false);
  let calls = 0;
  const probe: CredentialProbe = async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 10));
    return { known: true, loggedIn: true };
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

test("a STALE materialized file (expired, no refresh token) no longer reads connected", () => {
  withHoustonHome((credFile) => {
    // The screenshot bug: the file survives the credential it carried, and its
    // mere EXISTENCE shadowed a probe that correctly said logged-out — so the
    // AI Models page showed Connected while every turn hit the reconnect card.
    mkdirSync(dirname(credFile), { recursive: true });
    writeFileSync(
      credFile,
      JSON.stringify({
        claudeAiOauth: { accessToken: "sk-ant-oat01-x", expiresAt: 1 },
      }),
    );
    resetAnthropicCredentialCache(false);
    expect(anthropicCredentialCached()).toBe(false); // dead file → probe cache
    resetAnthropicCredentialCache(true);
    expect(anthropicCredentialCached()).toBe(true); // probe still decides
  });
});

test("a refresh-bearing file stays connected past its access-token expiry (SDK self-refreshes)", () => {
  withHoustonHome((credFile) => {
    mkdirSync(dirname(credFile), { recursive: true });
    writeFileSync(
      credFile,
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "sk-ant-oat01-x",
          refreshToken: "rt",
          expiresAt: 1,
        },
      }),
    );
    resetAnthropicCredentialCache(false);
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
