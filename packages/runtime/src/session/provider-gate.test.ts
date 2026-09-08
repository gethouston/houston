import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, expect, test, vi } from "vitest";

process.env.HOUSTON_DATA_DIR = mkdtempSync(
  join(tmpdir(), "houston-provider-gate-"),
);
process.env.HOUSTON_WORKSPACE_DIR = process.env.HOUSTON_DATA_DIR;

/**
 * The shared-dir signal, stubbed at its two seams: the SYNC read every status
 * surface uses, and the SETTLED read the turn gate awaits. `settled === true`
 * warms the sync read exactly like a real probe answering.
 */
const signal = vi.hoisted(() => ({
  cached: false,
  settled: undefined as boolean | undefined,
  settleCalls: 0,
}));
vi.mock("../backends/claude/credential-status", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../backends/claude/credential-status")
  >()),
  anthropicCredentialCached: () => signal.cached,
  anthropicCredentialSettled: async () => {
    signal.settleCalls += 1;
    if (signal.settled === true) signal.cached = true;
    return signal.settled;
  },
}));

const { config } = await import("../config");
const { connectedProviderForTurn, pinnedProviderUnavailable } = await import(
  "./provider-gate"
);

const saveActiveProvider = (provider: string) =>
  writeFileSync(
    join(config.dataDir, "settings.json"),
    JSON.stringify({ activeProvider: provider }),
  );

beforeEach(() => {
  signal.cached = false;
  signal.settled = undefined;
  signal.settleCalls = 0;
});

test("a pin with no stored credential is unavailable without waiting on anthropic", async () => {
  expect(await pinnedProviderUnavailable("openai-codex")).toBe(true);
  expect(signal.settleCalls).toBe(0);
});

test("an anthropic pin on a COLD signal is NOT refused (unknown is not logged out)", async () => {
  // The undelivered-prompt bug: the sync signal answers false while the first
  // probe is still running, and the turn was refused with its prompt attached.
  expect(await pinnedProviderUnavailable("anthropic")).toBe(false);
  expect(signal.settleCalls).toBe(1);
});

test("an anthropic pin the probe SETTLED logged-out is refused", async () => {
  signal.settled = false;
  expect(await pinnedProviderUnavailable("anthropic")).toBe(true);
});

test("an anthropic pin the probe settles connected is not refused", async () => {
  signal.settled = true;
  expect(await pinnedProviderUnavailable("anthropic")).toBe(false);
});

test("a connected provider never waits for the probe (no warm-path latency)", async () => {
  signal.cached = true;
  expect(await pinnedProviderUnavailable("anthropic")).toBe(false);
  expect(signal.settleCalls).toBe(0);
});

test("an unpinned turn on a saved anthropic pick awaits the signal before refusing", async () => {
  saveActiveProvider("anthropic");
  signal.settled = true;
  expect(await connectedProviderForTurn()).toBe("anthropic");
});

test("an unpinned turn still resolves null once the signal settles logged-out", async () => {
  saveActiveProvider("anthropic");
  signal.settled = false;
  expect(await connectedProviderForTurn()).toBeNull();
});

test("a resolvable provider skips the settle entirely", async () => {
  saveActiveProvider("anthropic");
  signal.cached = true;
  expect(await connectedProviderForTurn()).toBe("anthropic");
  expect(signal.settleCalls).toBe(0);
});
