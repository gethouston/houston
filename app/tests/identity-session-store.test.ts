import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { resolveAuthStorageConfig } from "../src/lib/auth-storage.ts";
import type { Session } from "../src/lib/identity/session.ts";

// A hermetic in-memory `localStorage`. session-store resolves to BROWSER mode
// under node:test (the storage-mode define is undefined), and its browser
// adapter reads `globalThis.localStorage` lazily at call time — so installing a
// fake here (before any store call) exercises the real load/save/clear path.
class FakeLocalStorage {
  store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) ?? null) : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

let fake: FakeLocalStorage;
beforeEach(() => {
  fake = new FakeLocalStorage();
  globalThis.localStorage = fake as unknown as Storage;
});
afterEach(() => {
  // @ts-expect-error — tear down the fake between tests.
  globalThis.localStorage = undefined;
});

// The blob key the browser-mode store derives (default scope → this key).
const STORAGE_KEY = resolveAuthStorageConfig({
  storageMode: "browser",
  storageScope: "",
}).storageKey;

const SESSION: Session = {
  idToken: "id-token-abc",
  refreshToken: "refresh-token-xyz",
  uid: "uid-1",
  email: "grace@example.com",
  emailVerified: true,
  displayName: "Grace Hopper",
  photoUrl: "https://example.com/grace.png",
  provider: "google.com",
  expiresAt: 1_900_000_000_000,
};

test("saveSession → loadSession round-trips the full session (incl. photoUrl)", async () => {
  const { loadSession, saveSession } = await import(
    "../src/lib/identity/session-store.ts"
  );
  await saveSession(SESSION);
  assert.deepEqual(await loadSession(), SESSION);
});

test("loadSession discards a stale foreign (Supabase-shaped) blob", async () => {
  const { loadSession } = await import("../src/lib/identity/session-store.ts");
  // A leftover Supabase session under the reused key — not a Firebase Session.
  fake.store.set(
    STORAGE_KEY,
    JSON.stringify({
      access_token: "supabase-jwt",
      refresh_token: "sb-refresh",
      user: { id: "sb-user", email: "old@example.com" },
    }),
  );
  assert.equal(await loadSession(), null);
});

test("loadSession returns null for a corrupt (unparseable) blob", async () => {
  const { loadSession } = await import("../src/lib/identity/session-store.ts");
  fake.store.set(STORAGE_KEY, "{not json");
  assert.equal(await loadSession(), null);
});

test("subscribeSession is notified on save (session) and clear (null)", async () => {
  const { saveSession, clearSession, subscribeSession } = await import(
    "../src/lib/identity/session-store.ts"
  );
  const seen: Array<Session | null> = [];
  const unsub = subscribeSession((s) => seen.push(s));
  await saveSession(SESSION);
  await clearSession();
  unsub();
  await saveSession(SESSION); // after unsubscribe — must NOT be observed
  assert.deepEqual(seen, [SESSION, null]);
});

test("loadSessionState maps a read fault to `unavailable` WITHOUT notifying", async () => {
  const { loadSessionState, subscribeSession } = await import(
    "../src/lib/identity/session-store.ts"
  );
  // A store whose read throws: the wiring must surface a FAULT, not a null that
  // would flip every subscriber to signed-out (the spurious-logout bug).
  globalThis.localStorage = {
    getItem: () => {
      throw new Error("storage read blew up");
    },
    setItem: () => {},
    removeItem: () => {},
  } as unknown as Storage;
  const seen: Array<Session | null> = [];
  const unsub = subscribeSession((s) => seen.push(s));
  const state = await loadSessionState();
  unsub();
  assert.equal(state.kind, "unavailable");
  assert.deepEqual(seen, [], "a read fault must never broadcast");
});

test("loadSessionState reports `none` for an absent entry", async () => {
  const { loadSessionState } = await import(
    "../src/lib/identity/session-store.ts"
  );
  assert.deepEqual(await loadSessionState(), { kind: "none" });
});

test("loadSessionState reports `none` for a corrupt blob", async () => {
  const { loadSessionState } = await import(
    "../src/lib/identity/session-store.ts"
  );
  fake.store.set(STORAGE_KEY, "{not json");
  assert.deepEqual(await loadSessionState(), { kind: "none" });
});

test("saveSession rethrows when the underlying storage write fails", async () => {
  const { saveSession } = await import("../src/lib/identity/session-store.ts");
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {
      throw new Error("quota exceeded");
    },
    removeItem: () => {},
  } as unknown as Storage;
  await assert.rejects(() => saveSession(SESSION), /Sign-in storage failed/);
});
