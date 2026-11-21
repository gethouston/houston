import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { config } from "../config";

config.dataDir = mkdtempSync(join(tmpdir(), "houston-erg-data-"));

vi.mock("./serve-sync-run", () => ({ runServedSync: vi.fn(async () => []) }));

const { runServedSync } = await import("./serve-sync-run");
const { BIND_GRACE_MS, bindEmptyRefreshServeSync, runEmptyRefreshServeSync } =
  await import("./empty-refresh-guard");

const serveMode = (on: boolean) => {
  config.controlPlaneUrl = on ? "http://control-plane.test" : "";
  config.sandboxToken = on ? "sbx-token" : "";
};

test("off serve mode the guard stays a true no-op", async () => {
  serveMode(false);
  const report = vi.spyOn(console, "error").mockImplementation(() => {});
  await runEmptyRefreshServeSync();
  expect(runServedSync).not.toHaveBeenCalled();
  expect(report).not.toHaveBeenCalled();
  report.mockRestore();
});

test("in serve mode an unbound read reports only once nothing has bound within the grace", async () => {
  serveMode(true);
  bindEmptyRefreshServeSync(null);
  vi.useFakeTimers();
  const report = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await runEmptyRefreshServeSync();
    await runEmptyRefreshServeSync();
    await runEmptyRefreshServeSync();
    expect(report).not.toHaveBeenCalled();
    expect(runServedSync).not.toHaveBeenCalled();

    vi.advanceTimersByTime(BIND_GRACE_MS);
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(
      expect.stringContaining("no served sync is bound"),
    );
  } finally {
    report.mockRestore();
    vi.useRealTimers();
    serveMode(false);
  }
});

test("serve.ts binding within the grace cancels the deferred report", async () => {
  serveMode(true);
  bindEmptyRefreshServeSync(null);
  vi.useFakeTimers();
  const report = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await runEmptyRefreshServeSync();
    bindEmptyRefreshServeSync(async () => {});
    vi.advanceTimersByTime(BIND_GRACE_MS * 2);
    expect(report).not.toHaveBeenCalled();
  } finally {
    report.mockRestore();
    vi.useRealTimers();
    serveMode(false);
  }
});

test("loading serve.ts binds the guard, and a store read re-serves through it", async () => {
  serveMode(true);
  bindEmptyRefreshServeSync(null);
  await import("./serve");
  vi.mocked(runServedSync).mockClear();
  const { HoustonAuthStore } = await import("./credential-store");
  const store = new HoustonAuthStore(join(config.dataDir, "auth.json"));
  store.set("openai-codex", {
    type: "oauth",
    access: "served-at",
    refresh: "",
    expires: Date.now() + 60_000,
  });

  await store.read("openai-codex");

  expect(runServedSync).toHaveBeenCalled();
  serveMode(false);
});
