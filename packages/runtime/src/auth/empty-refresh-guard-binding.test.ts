import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { config } from "../config";

/**
 * PRODUCT-1317's guard re-serves an expiring access-only entry through
 * serve.ts's sync. serve.ts binds that sync when it loads, and every runtime
 * loads it at boot (the turn start and the provider routes import it), so the
 * binding is in place before any refresh closure can fire. This suite pins the
 * three states: no-op off serve mode, bound once serve.ts loaded, and a loud
 * report (never a silent skip) if serve mode is on with nothing bound.
 */

config.dataDir = mkdtempSync(join(tmpdir(), "houston-erg-data-"));

// The sweep behind the sync is exercised end to end in serve.test.ts; here it
// only has to be observable.
vi.mock("./serve-sync-run", () => ({ runServedSync: vi.fn(async () => []) }));

const { runServedSync } = await import("./serve-sync-run");
const { bindEmptyRefreshServeSync, runEmptyRefreshServeSync } = await import(
  "./empty-refresh-guard"
);

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

test("in serve mode an unbound guard reports loudly instead of skipping", async () => {
  serveMode(true);
  bindEmptyRefreshServeSync(null);
  const report = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(runEmptyRefreshServeSync()).resolves.toBeUndefined();
  expect(report).toHaveBeenCalledWith(
    expect.stringContaining("no served sync is bound"),
  );
  report.mockRestore();
  serveMode(false);
});

test("loading serve.ts binds the guard, and a store read re-serves through it", async () => {
  serveMode(true);
  bindEmptyRefreshServeSync(null);
  await import("./serve");
  vi.mocked(runServedSync).mockClear();
  const { HoustonAuthStore } = await import("./credential-store");
  const store = new HoustonAuthStore(join(config.dataDir, "auth.json"));
  // A served entry inside pi's five-minute validity floor: the exact state
  // that must re-sync centrally before pi's expiry check runs.
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
