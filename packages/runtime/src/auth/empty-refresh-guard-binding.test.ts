import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { config } from "../config";

/**
 * PRODUCT-1317's guard must not be switchable off by an import graph.
 *
 * The re-serve used to be a binding `serve.ts` performed at load, so it was only
 * in place if something had imported `serve.ts` first — a caller that reached
 * the store through a shorter path (importing `serve-context` for `serveModeOn`)
 * left the guard silently disabled and pi free to POST `refresh_token=""`. So
 * nothing here imports `serve.ts`: the guard has to reach for it itself.
 */

config.dataDir = mkdtempSync(join(tmpdir(), "houston-erg-data-"));

// Stands in for the real sync (exercised end to end in serve.test.ts) — this
// suite is about WHICH function the guard resolves, and that it resolves one.
vi.mock("./serve", () => ({ syncServedCredentialSafe: vi.fn(async () => {}) }));

const { syncServedCredentialSafe } = await import("./serve");
const { runEmptyRefreshServeSync } = await import("./empty-refresh-guard");
const { HoustonAuthStore } = await import("./credential-store");

test("off serve mode the guard stays a true no-op", async () => {
  config.controlPlaneUrl = "";
  config.sandboxToken = "";
  vi.mocked(syncServedCredentialSafe).mockClear();

  await runEmptyRefreshServeSync();

  // An access-only entry only exists where the serve path wrote one, so there
  // is nothing to re-serve on desktop/self-host.
  expect(syncServedCredentialSafe).not.toHaveBeenCalled();
});

test("a store read re-serves in serve mode, with nothing having imported serve.ts", async () => {
  config.controlPlaneUrl = "http://control-plane.test";
  config.sandboxToken = "sbx-token";
  vi.mocked(syncServedCredentialSafe).mockClear();
  const store = new HoustonAuthStore(join(config.dataDir, "auth.json"));
  // A Gate #2 served entry inside pi's five-minute validity floor: the exact
  // state that must re-sync centrally before pi's expiry check runs.
  store.set("openai-codex", {
    type: "oauth",
    access: "served-at",
    refresh: "",
    expires: Date.now() + 60_000,
  });

  await store.read("openai-codex");

  expect(syncServedCredentialSafe).toHaveBeenCalledWith("empty-refresh-guard");
  config.controlPlaneUrl = "";
  config.sandboxToken = "";
});
