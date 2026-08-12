import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Credential } from "@earendil-works/pi-ai";
import { afterEach, expect, test } from "vitest";
import { HoustonAuthStore } from "./credential-store";
import {
  bindEmptyRefreshServeSync,
  needsServeSync,
  PI_OAUTH_MIN_VALIDITY_MS,
} from "./empty-refresh-guard";

/**
 * PRODUCT-1317 regression: a served access-only OAuth entry (Gate #2's
 * `refresh:""`) must NEVER reach a provider refresher. pi-ai 0.84.1 routes any
 * stored OAuth entry within 5 minutes of expiry through `oauth.refresh(current)`
 * inside `credentials.modify` (dist/auth/resolve.js) — the closures below are
 * that code path's exact shape, so these tests pin the store-level contract pi
 * actually exercises.
 */

function tmpStore(): HoustonAuthStore {
  return new HoustonAuthStore(
    join(mkdtempSync(join(tmpdir(), "houston-guard-")), "auth.json"),
  );
}

const served = (expires: number): Credential => ({
  type: "oauth",
  access: "served-at",
  refresh: "",
  expires,
});

const full = (access: string, expires: number): Credential => ({
  type: "oauth",
  access,
  refresh: "rt",
  expires,
});

/** pi's refresh closure (resolveStoredOAuth): dereferences `current`, then
 *  calls the provider refresher with it — the POST the guard must prevent. */
function piRefreshClosure(refresher: (cred: Credential) => Credential) {
  return async (current: Credential | undefined) => {
    if (current?.type !== "oauth") return undefined; // "logged out meanwhile"
    return refresher(current);
  };
}

afterEach(() => bindEmptyRefreshServeSync(null));

test("an expiring access-only entry re-syncs at read, and pi sees the replaced token", async () => {
  const store = tmpStore();
  store.set("openai-codex", served(Date.now() + 60_000));
  let syncs = 0;
  bindEmptyRefreshServeSync(async () => {
    // What runServedSync does: apply the central credential + reload the cache.
    syncs++;
    store.set("openai-codex", served(Date.now() + 3_600_000));
  });
  const seen = await store.read("openai-codex");
  expect(syncs).toBe(1);
  // The fresh token clears pi's floor, so its refresh path never even arms.
  expect((seen as { expires: number }).expires).toBeGreaterThan(
    Date.now() + PI_OAUTH_MIN_VALIDITY_MS,
  );
});

test("when the sync cannot replace it, pi's refresher is never invoked with the empty string", async () => {
  const store = tmpStore();
  const entry = served(Date.now() + 60_000);
  store.set("openai-codex", entry);
  bindEmptyRefreshServeSync(async () => {}); // serve down / central row gone
  await store.read("openai-codex");
  const refreshed: Credential[] = [];
  const post = await store.modify(
    "openai-codex",
    piRefreshClosure((cred) => {
      refreshed.push(cred);
      return full("must-not-happen", Date.now() + 3_600_000);
    }),
  );
  expect(refreshed).toEqual([]); // no provider POST with refresh_token=""
  // Entry unchanged: pi serves the stored access token as-is via toAuth.
  expect(post).toEqual(entry);
  expect(store.get("openai-codex")).toEqual(entry);
});

test("an unbound sync (desktop/self-host) is a no-op, and the mask still holds", async () => {
  const store = tmpStore();
  const entry = served(Date.now() + 60_000);
  store.set("openai-codex", entry);
  expect(await store.read("openai-codex")).toEqual(entry);
  const refreshed: Credential[] = [];
  await store.modify(
    "openai-codex",
    piRefreshClosure((cred) => {
      refreshed.push(cred);
      return full("must-not-happen", Date.now() + 3_600_000);
    }),
  );
  expect(refreshed).toEqual([]);
});

test("a healthy refresh-bearing credential still refreshes through modify", async () => {
  const store = tmpStore();
  store.set("openai-codex", full("old-at", Date.now() - 1_000));
  const refreshed: Credential[] = [];
  const rotated = full("new-at", Date.now() + 3_600_000);
  const post = await store.modify(
    "openai-codex",
    piRefreshClosure((cred) => {
      refreshed.push(cred);
      return rotated;
    }),
  );
  // The mask is scoped to refresh:"" — a real refresh token passes through.
  expect(refreshed).toHaveLength(1);
  expect((refreshed[0] as { refresh: string }).refresh).toBe("rt");
  expect(post).toEqual(rotated);
  expect(store.get("openai-codex")).toEqual(rotated);
});

test("a long-lived served token and a pasted no-expiry token never trigger the sync", async () => {
  const store = tmpStore();
  let syncs = 0;
  bindEmptyRefreshServeSync(async () => {
    syncs++;
  });
  store.set("openai-codex", served(Date.now() + 3_600_000));
  await store.read("openai-codex");
  // A pasted access token records no expiry — there is no central row to serve.
  store.set("github-copilot", served(0));
  await store.read("github-copilot");
  expect(syncs).toBe(0);
});

test("needsServeSync fires exactly on pi's five-minute window for access-only entries", () => {
  const now = Date.now();
  const inWindow = now + PI_OAUTH_MIN_VALIDITY_MS - 1_000;
  const outside = now + PI_OAUTH_MIN_VALIDITY_MS + 60_000;
  expect(needsServeSync(served(inWindow), now)).toBe(true);
  expect(needsServeSync(served(outside), now)).toBe(false);
  expect(needsServeSync(served(0), now)).toBe(false); // pasted, no expiry
  expect(needsServeSync(full("at", inWindow), now)).toBe(false); // pi refreshes it
  expect(needsServeSync({ type: "api_key", key: "k" }, now)).toBe(false);
  expect(needsServeSync(undefined, now)).toBe(false);
});
