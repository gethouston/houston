import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  type IdentityLogLevel,
  setIdentityLogSink,
} from "../src/lib/identity/log.ts";
import type { Session } from "../src/lib/identity/session.ts";
import { serializeSession } from "../src/lib/identity/session.ts";
import {
  createSessionLoader,
  type SessionLoadDeps,
} from "../src/lib/identity/session-load.ts";
import type { ReadResult } from "../src/lib/identity/session-storage-kv.ts";

// Pure orchestration tests: createSessionLoader is dependency-injected, so the
// read-fault / ACL-rebind logic is exercised WITHOUT Tauri or keychain mode
// (which the real singleton bakes in at build time and can't reach under
// node:test). Mirrors the oauth-attempt.ts unit-test seam.

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
const BLOB = serializeSession(SESSION);

interface Recorder {
  notified: Array<Session | null>;
  rewrites: string[];
  removes: number;
}

function deps(
  read: ReadResult | (() => Promise<ReadResult>),
  overrides: Partial<SessionLoadDeps> = {},
): { deps: SessionLoadDeps; rec: Recorder } {
  const rec: Recorder = { notified: [], rewrites: [], removes: 0 };
  return {
    rec,
    deps: {
      read: typeof read === "function" ? read : async () => read,
      notify: (s) => rec.notified.push(s),
      keychainMode: true,
      rewrite: async (blob) => {
        rec.rewrites.push(blob);
      },
      epoch: () => 0,
      remove: async () => {
        rec.removes += 1;
      },
      ...overrides,
    },
  };
}

/** Let the fire-and-forget rebind promise settle. */
const settle = () => new Promise((r) => setImmediate(r));

afterEach(() => setIdentityLogSink(null));

test("read fault → unavailable, subscribers are NOT notified", async () => {
  const { deps: d, rec } = deps({ ok: false, error: "keychain locked" });
  const state = await createSessionLoader(d)();
  assert.deepEqual(state, { kind: "unavailable", error: "keychain locked" });
  assert.equal(rec.notified.length, 0, "a fault must never broadcast null");
  assert.equal(rec.rewrites.length, 0);
});

test("absent → none, notifies null, no rebind write", async () => {
  const { deps: d, rec } = deps({ ok: true, value: null });
  const state = await createSessionLoader(d)();
  assert.deepEqual(state, { kind: "none" });
  assert.deepEqual(rec.notified, [null]);
  assert.equal(rec.rewrites.length, 0);
});

test("corrupt blob → none, notifies null, no rebind write", async () => {
  const { deps: d, rec } = deps({ ok: true, value: "{not json" });
  const state = await createSessionLoader(d)();
  assert.deepEqual(state, { kind: "none" });
  assert.deepEqual(rec.notified, [null]);
  assert.equal(rec.rewrites.length, 0);
});

test("valid session → session + notify + ONE ACL rebind write of the same blob", async () => {
  const { deps: d, rec } = deps({ ok: true, value: BLOB });
  const load = createSessionLoader(d);
  const state = await load();
  assert.deepEqual(state, { kind: "session", session: SESSION });
  assert.deepEqual(rec.notified, [SESSION]);
  assert.deepEqual(rec.rewrites, [BLOB], "rebinds the ACL with the exact blob");

  // The rebind is once-per-run: a second load must not rewrite again.
  await load();
  assert.deepEqual(rec.rewrites, [BLOB]);
});

test("load resolves without waiting on the rebind write (fire-and-forget)", async () => {
  let resolveWrite!: () => void;
  const { deps: d } = deps(
    { ok: true, value: BLOB },
    {
      rewrite: () =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
        }),
    },
  );
  // A hung keychain WRITE must never pin boot: load resolves while pending.
  const state = await createSessionLoader(d)();
  assert.deepEqual(state, { kind: "session", session: SESSION });
  resolveWrite();
});

test("a sign-out racing the rebind write re-clears the blob", async () => {
  let epoch = 0;
  let resolveWrite!: () => void;
  const { deps: d, rec } = deps(
    { ok: true, value: BLOB },
    {
      epoch: () => epoch,
      rewrite: () =>
        new Promise<void>((resolve) => {
          resolveWrite = resolve;
        }),
    },
  );
  const state = await createSessionLoader(d)();
  assert.deepEqual(state, { kind: "session", session: SESSION });
  epoch += 1; // clearSession() lands while the maintenance write is in flight
  resolveWrite();
  await settle();
  assert.equal(rec.removes, 1, "the rebind must compensate a raced sign-out");
});

test("ACL rebind is skipped off keychain mode", async () => {
  const { deps: d, rec } = deps(
    { ok: true, value: BLOB },
    { keychainMode: false },
  );
  const state = await createSessionLoader(d)();
  assert.deepEqual(state, { kind: "session", session: SESSION });
  assert.equal(rec.rewrites.length, 0, "browser mode never rebinds");
});

test("ACL rebind write failure is swallowed (session still returned) and logged", async () => {
  const logged: Array<{ level: IdentityLogLevel; message: string }> = [];
  setIdentityLogSink((level, message) => logged.push({ level, message }));
  const { deps: d } = deps(
    { ok: true, value: BLOB },
    {
      rewrite: async () => {
        throw new Error("keychain write denied");
      },
    },
  );
  const state = await createSessionLoader(d)();
  // The maintenance write failing must NOT affect the returned session.
  assert.deepEqual(state, { kind: "session", session: SESSION });
  await settle();
  assert.ok(
    logged.some(
      (l) =>
        l.level === "error" && l.message.includes("ACL rebind write failed"),
    ),
    "the swallowed rebind failure must be logged",
  );
});
