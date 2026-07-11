import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type { Session } from "../src/lib/identity/session.ts";

// refresh.ts persists through session-store, which resolves to BROWSER mode
// under node:test — so a fake `localStorage` makes the whole flow hermetic. The
// securetoken refresh call is `fetch`, stubbed per test. No Tauri, no network.

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

const realFetch = globalThis.fetch;
let fake: FakeLocalStorage;

beforeEach(() => {
  fake = new FakeLocalStorage();
  globalThis.localStorage = fake as unknown as Storage;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  // @ts-expect-error — tear down the fake between tests.
  globalThis.localStorage = undefined;
});

const SESSION: Session = {
  idToken: "old-id",
  refreshToken: "refresh-1",
  uid: "uid-1",
  email: "grace@example.com",
  emailVerified: true,
  displayName: "Grace",
  photoUrl: "https://example.com/grace.png",
  provider: "google.com",
  expiresAt: 1_000,
};

async function seedSession(): Promise<void> {
  const { saveSession } = await import("../src/lib/identity/session-store.ts");
  await saveSession(SESSION);
}

test("refreshNow collapses concurrent calls into ONE refresh request", async () => {
  await seedSession();
  const { refreshNow } = await import("../src/lib/identity/refresh.ts");

  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    // Resolve on a later tick so both callers observe the same in-flight run.
    await new Promise((r) => setTimeout(r, 5));
    return new Response(
      JSON.stringify({
        id_token: "new-id",
        refresh_token: "refresh-2",
        expires_in: "3600",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  const [a, b] = await Promise.all([refreshNow(), refreshNow()]);
  assert.equal(calls, 1);
  assert.equal(a, "new-id");
  assert.equal(b, "new-id");
});

test("refreshNow merges the new token but preserves profile fields", async () => {
  await seedSession();
  const { refreshNow } = await import("../src/lib/identity/refresh.ts");
  const { loadSession } = await import("../src/lib/identity/session-store.ts");

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        id_token: "new-id",
        refresh_token: "refresh-2",
        expires_in: "3600",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;

  await refreshNow();
  const stored = await loadSession();
  assert.ok(stored);
  assert.equal(stored.idToken, "new-id");
  assert.equal(stored.refreshToken, "refresh-2");
  assert.equal(stored.uid, "uid-1");
  assert.equal(stored.photoUrl, "https://example.com/grace.png");
  assert.equal(stored.displayName, "Grace");
});

test("refreshNow clears the session and returns null on an invalid refresh token", async () => {
  await seedSession();
  const { refreshNow } = await import("../src/lib/identity/refresh.ts");
  const { loadSession } = await import("../src/lib/identity/session-store.ts");

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ error: { message: "INVALID_REFRESH_TOKEN" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    )) as typeof fetch;

  assert.equal(await refreshNow(), null);
  assert.equal(await loadSession(), null);
});

test("refreshNow signs out on a disabled account (USER_DISABLED is terminal)", async () => {
  await seedSession();
  const { refreshNow } = await import("../src/lib/identity/refresh.ts");
  const { loadSession } = await import("../src/lib/identity/session-store.ts");

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: { message: "USER_DISABLED" } }), {
      status: 400,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

  assert.equal(await refreshNow(), null);
  assert.equal(await loadSession(), null);
});

test("refreshNow returns null when there is no stored session", async () => {
  const { refreshNow } = await import("../src/lib/identity/refresh.ts");
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  assert.equal(await refreshNow(), null);
  assert.equal(calls, 0);
});

test("proactive refresh backs off on a transient failure near expiry (no hot loop)", async () => {
  // A session already inside the skew window: the expiry-based delay is 0, so
  // without backoff a failing refresh would reschedule at 0 and hammer the
  // network. With backoff it must fire at most once in a short window.
  const { saveSession } = await import("../src/lib/identity/session-store.ts");
  await saveSession({ ...SESSION, expiresAt: Date.now() }); // past the skew

  const { startProactiveRefresh, stopProactiveRefresh } = await import(
    "../src/lib/identity/refresh.ts"
  );

  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new TypeError("network down"); // transient → IdentityError("network")
  }) as typeof fetch;

  startProactiveRefresh();
  // Let the immediate (delay-0) first fire run and its backoff arm the next.
  await new Promise((r) => setTimeout(r, 80));
  stopProactiveRefresh();

  // Exactly one attempt in the window — the 30s backoff prevents a hot loop.
  assert.ok(calls <= 1, `expected <=1 refresh attempt, got ${calls}`);
});

test("refreshNow abandons the save when clearSession fired mid-flight (sign-out race)", async () => {
  await seedSession();
  const { refreshNow, setSessionSink } = await import(
    "../src/lib/identity/refresh.ts"
  );
  const { clearSession, loadSession } = await import(
    "../src/lib/identity/session-store.ts"
  );

  // Track the refresh sink: it must NOT receive a session on the abandon path.
  const sinkUpdates: (Session | null)[] = [];
  setSessionSink((s) => sinkUpdates.push(s));

  // Gate the securetoken response so sign-out can win the race deterministically.
  let releaseFetch: () => void = () => {};
  globalThis.fetch = (async () => {
    await new Promise<void>((r) => {
      releaseFetch = r;
    });
    return new Response(
      JSON.stringify({
        id_token: "new-id",
        refresh_token: "refresh-2",
        expires_in: "3600",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  const pending = refreshNow();
  // Let doRefresh read the session and reach the awaiting fetch.
  await new Promise((r) => setTimeout(r, 5));
  // Sign-out clears the session while the refresh is in flight.
  await clearSession();
  sinkUpdates.length = 0; // ignore the clear's own notify; watch what refresh does
  // Now let the (stale) refresh response arrive.
  releaseFetch();

  assert.equal(await pending, null);
  // Storage must stay empty — the refresh must not resurrect the cleared session.
  assert.equal(await loadSession(), null);
  // The refresh sink must not have pushed a session back into the cache.
  assert.deepEqual(sinkUpdates, []);

  setSessionSink(() => {});
});
