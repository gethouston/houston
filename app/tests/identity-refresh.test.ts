import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import type { Session } from "../src/lib/identity/session.ts";

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

test("refreshNow signs out on a deleted account (USER_NOT_FOUND is terminal)", async () => {
  await seedSession();
  const { refreshNow } = await import("../src/lib/identity/refresh.ts");
  const { loadSession } = await import("../src/lib/identity/session-store.ts");

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: { message: "USER_NOT_FOUND" } }), {
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

test("refreshNow RETHROWS a transient network failure and keeps the session", async () => {
  await seedSession();
  const { refreshNow } = await import("../src/lib/identity/refresh.ts");
  const { loadSession } = await import("../src/lib/identity/session-store.ts");
  const { isIdentityError } = await import("../src/lib/identity/errors.ts");

  globalThis.fetch = (async () => {
    throw new TypeError("Load failed");
  }) as typeof fetch;

  await assert.rejects(refreshNow(), (e: unknown) => {
    assert.ok(isIdentityError(e), "expected a typed IdentityError");
    assert.equal(e.code, "network");
    return true;
  });
  assert.deepEqual(await loadSession(), SESSION);
});

test("proactive refresh backs off on a transient failure near expiry (no hot loop)", async () => {
  const { saveSession } = await import("../src/lib/identity/session-store.ts");
  await saveSession({ ...SESSION, expiresAt: Date.now() });

  const { startProactiveRefresh, stopProactiveRefresh } = await import(
    "../src/lib/identity/refresh-timer.ts"
  );

  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new TypeError("network down");
  }) as typeof fetch;

  startProactiveRefresh();
  await new Promise((r) => setTimeout(r, 80));
  stopProactiveRefresh();

  assert.ok(calls <= 1, `expected <=1 refresh attempt, got ${calls}`);
});

test("the post-save compensation never deletes a NEWER account's session", async () => {
  await seedSession();
  const { refreshNow, setSessionSink } = await import(
    "../src/lib/identity/refresh.ts"
  );
  const { clearSession, loadSession, saveSession } = await import(
    "../src/lib/identity/session-store.ts"
  );

  const NEW_ACCOUNT: Session = {
    ...SESSION,
    idToken: "new-account-id",
    refreshToken: "new-account-refresh",
    uid: "uid-2",
    email: "ada@example.com",
  };

  setSessionSink(() => {});
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        id_token: "stale-id",
        refresh_token: "stale-refresh",
        expires_in: "3600",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;

  let armed = true;
  const realSetItem = fake.setItem.bind(fake);
  fake.setItem = (key: string, value: string) => {
    realSetItem(key, value);
    if (armed && String(value).includes("stale-id")) {
      armed = false;
      void clearSession();
      void saveSession(NEW_ACCOUNT);
    }
  };

  assert.equal(await refreshNow(), null, "the stale refresh must abandon");
  assert.deepEqual(
    await loadSession(),
    NEW_ACCOUNT,
    "the compensating clear wiped the newly signed-in account",
  );

  setSessionSink(() => {});
});

test("refreshNow abandons the save when clearSession lands DURING the stored-session read", async () => {
  await seedSession();
  const { refreshNow, setSessionSink } = await import(
    "../src/lib/identity/refresh.ts"
  );
  const { clearSession, loadSession } = await import(
    "../src/lib/identity/session-store.ts"
  );

  const sinkUpdates: (Session | null)[] = [];
  setSessionSink((s) => sinkUpdates.push(s));

  let armed = true;
  const realGetItem = fake.getItem.bind(fake);
  fake.getItem = (key: string) => {
    const value = realGetItem(key);
    if (armed) {
      armed = false;
      void clearSession();
    }
    return value;
  };

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        id_token: "new-id",
        refresh_token: "refresh-2",
        expires_in: "3600",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;

  assert.equal(await refreshNow(), null);
  assert.equal(
    await loadSession(),
    null,
    "the cleared session was resurrected",
  );
  assert.deepEqual(
    sinkUpdates.filter((s) => s !== null),
    [],
    "the refresh pushed the signed-out account back into the cache",
  );

  setSessionSink(() => {});
});

test("refreshNow abandons the save when clearSession fired mid-flight (sign-out race)", async () => {
  await seedSession();
  const { refreshNow, setSessionSink } = await import(
    "../src/lib/identity/refresh.ts"
  );
  const { clearSession, loadSession } = await import(
    "../src/lib/identity/session-store.ts"
  );

  const sinkUpdates: (Session | null)[] = [];
  setSessionSink((s) => sinkUpdates.push(s));

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
  await new Promise((r) => setTimeout(r, 5));
  await clearSession();
  sinkUpdates.length = 0;
  releaseFetch();

  assert.equal(await pending, null);
  assert.equal(await loadSession(), null);
  assert.deepEqual(sinkUpdates, []);

  setSessionSink(() => {});
});

const realNow = Date.now;
let clockOffsetMs = 0;
beforeEach(() => {
  clockOffsetMs = 0;
  Date.now = () => realNow() + clockOffsetMs;
});
afterEach(() => {
  Date.now = realNow;
});

function tokenResponse(idToken: string, expiresIn = "3600"): Response {
  return new Response(
    JSON.stringify({
      id_token: idToken,
      refresh_token: `${idToken}-refresh`,
      expires_in: expiresIn,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function jwtExpiringIn(expOffsetS: number, tag: string): string {
  const nowS = Math.floor(realNow() / 1000);
  const enc = (o: unknown) =>
    Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "RS256", kid: tag })}.${enc({
    sub: "uid-1",
    iat: nowS + expOffsetS - 3600,
    exp: nowS + expOffsetS,
    tag,
  })}.sig`;
}

test("refreshNow never hands out a token that outlived its lifetime in flight: it mints again", async () => {
  await seedSession();
  const { refreshNow, setSessionSink } = await import(
    "../src/lib/identity/refresh.ts"
  );
  const { loadSession } = await import("../src/lib/identity/session-store.ts");
  const sinkUpdates: (Session | null)[] = [];
  setSessionSink((s) => sinkUpdates.push(s));

  let calls = 0;
  const bodies: string[] = [];
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    calls += 1;
    bodies.push(String(init?.body));
    if (calls === 1) clockOffsetMs += 5_221_000;
    return tokenResponse(calls === 1 ? "slept" : "fresh");
  }) as typeof fetch;

  assert.equal(await refreshNow(), "fresh");
  assert.equal(calls, 2, "expected exactly one extra mint");
  assert.match(bodies[1], /refresh_token=slept-refresh/);
  const stored = await loadSession();
  assert.equal(stored?.idToken, "fresh");
  assert.equal(stored?.refreshToken, "fresh-refresh");
  assert.deepEqual(
    sinkUpdates.map((s) => s?.idToken),
    ["fresh"],
    "the expired token must never be broadcast",
  );
  setSessionSink(() => {});
});

test("joiners of a pre-sleep in-flight refresh receive the re-minted token (one extra request)", async () => {
  await seedSession();
  const { refreshNow } = await import("../src/lib/identity/refresh.ts");

  let releaseFirst: () => void = () => {};
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) {
      await new Promise<void>((r) => {
        releaseFirst = r;
      });
      return tokenResponse("slept");
    }
    return tokenResponse("fresh");
  }) as typeof fetch;

  const timerRun = refreshNow();
  await new Promise((r) => setTimeout(r, 5));
  clockOffsetMs += 5_221_000;
  const wakeReplay = refreshNow();
  releaseFirst();

  assert.equal(await timerRun, "fresh");
  assert.equal(await wakeReplay, "fresh");
  assert.equal(calls, 2);
});

test("a second mint that fails offline rethrows as network and keeps the stored session", async () => {
  await seedSession();
  const { refreshNow } = await import("../src/lib/identity/refresh.ts");
  const { loadSession } = await import("../src/lib/identity/session-store.ts");
  const { isIdentityError } = await import("../src/lib/identity/errors.ts");

  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) {
      clockOffsetMs += 5_221_000;
      return tokenResponse("slept");
    }
    throw new TypeError("Load failed");
  }) as typeof fetch;

  await assert.rejects(refreshNow(), (e: unknown) => {
    assert.ok(isIdentityError(e));
    assert.equal(e.code, "network");
    return true;
  });
  assert.equal(calls, 2);
  assert.deepEqual(await loadSession(), SESSION, "old token kept for retry");
  globalThis.fetch = (async () => tokenResponse("later")) as typeof fetch;
  assert.equal(await refreshNow(), "later");
});

test("the stored expiresAt is dated from the request's send, never its read", async () => {
  await seedSession();
  const { refreshNow } = await import("../src/lib/identity/refresh.ts");
  const { loadSession } = await import("../src/lib/identity/session-store.ts");

  globalThis.fetch = (async () => {
    clockOffsetMs += 600_000;
    return tokenResponse("fresh");
  }) as typeof fetch;

  await refreshNow();
  const stored = await loadSession();
  assert.ok(stored);
  const remainingMs = stored.expiresAt - Date.now();
  assert.ok(
    remainingMs <= 3_000_000 && remainingMs > 2_990_000,
    `expected ~3000 s left, got ${remainingMs} ms`,
  );
});

test("a client clock an hour ahead of Google's refreshes once, not in a loop", async () => {
  const { saveSession } = await import("../src/lib/identity/session-store.ts");
  await saveSession({ ...SESSION, expiresAt: Date.now() });
  const { startProactiveRefresh, stopProactiveRefresh } = await import(
    "../src/lib/identity/refresh-timer.ts"
  );

  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return tokenResponse(jwtExpiringIn(-3_400, `skewed-${calls}`));
  }) as typeof fetch;

  startProactiveRefresh();
  await new Promise((r) => setTimeout(r, 80));
  stopProactiveRefresh();

  assert.equal(calls, 1, `expected one refresh, got ${calls}`);
});

test("expiresAtFromSend and isSleptOut judge by wall-clock duration only", async () => {
  const { expiresAtFromSend, isSleptOut, MIN_REMAINING_MS } = await import(
    "../src/lib/identity/refresh-mint.ts"
  );
  const minted = { idToken: "t", refreshToken: "r", expiresAt: 0 };
  const readAt = 5_221_000;
  const slept = expiresAtFromSend(
    0,
    { ...minted, expiresAt: readAt + 3_600_000 },
    readAt,
  );
  assert.equal(slept, 3_600_000);
  assert.equal(isSleptOut(slept, readAt), true, "expired 1621 s before read");
  const quick = expiresAtFromSend(
    0,
    { ...minted, expiresAt: 200 + 3_600_000 },
    200,
  );
  assert.equal(isSleptOut(quick, 200), false);
  assert.equal(isSleptOut(MIN_REMAINING_MS, 0), true);
  assert.equal(isSleptOut(MIN_REMAINING_MS + 1, 0), false);
});
