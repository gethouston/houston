import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { WorkspaceCredential } from "../ports";
import {
  CredentialGoneError,
  CredentialRefreshCoalescer,
} from "./refresh-coalescer";

/**
 * The serve path refreshes ONE credential per (workspace, scope, provider) at a
 * time. openai-codex rotates the refresh token on every use, so a concurrent
 * burst (one runtime process per agent, each serving per turn AND per
 * /providers poll) used to spend the same refresh token N times: the first
 * exchange wins, the rest come back invalid_grant, and the route reads that as
 * "session ended" and deletes the user's credential.
 */

/** Fake clock shared by the coalescer's TTL and refresh.ts's isExpiring. */
let clock = 1_700_000_000_000;

function tick(ms: number) {
  clock += ms;
  vi.setSystemTime(clock);
}

beforeEach(() => {
  clock = 1_700_000_000_000;
  vi.useFakeTimers();
  vi.setSystemTime(clock);
});

afterEach(() => {
  vi.useRealTimers();
});

const now = () => clock;

function cred(over: Partial<WorkspaceCredential> = {}): WorkspaceCredential {
  return {
    workspaceId: "w1",
    provider: "openai-codex",
    accessToken: "AT-old",
    refreshToken: "RT-old",
    expiresAt: clock + 1_000, // inside the 120s skew → expiring
    ...over,
  };
}

/** A rotated credential: new access + refresh, an hour of life. */
function rotated(suffix = ""): WorkspaceCredential {
  return cred({
    accessToken: `AT-new${suffix}`,
    refreshToken: `RT-new${suffix}`,
    expiresAt: clock + 3_600_000,
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function harness(
  doRefresh: (c: WorkspaceCredential) => Promise<WorkspaceCredential>,
  load: () => Promise<WorkspaceCredential | null>,
) {
  const calls: WorkspaceCredential[] = [];
  const persisted: WorkspaceCredential[] = [];
  const coalescer = new CredentialRefreshCoalescer(async (c) => {
    calls.push(c);
    return doRefresh(c);
  }, now);
  const run = (acting?: { actingAs: string }) =>
    coalescer.run({
      workspaceId: "w1",
      provider: "openai-codex",
      acting,
      load,
      persist: async (c) => {
        persisted.push(c);
      },
    });
  return { coalescer, calls, persisted, run };
}

test("a concurrent burst produces exactly one refresh and one persist", async () => {
  const gate = deferred<WorkspaceCredential>();
  const expiring = cred();
  const { calls, persisted, run } = harness(
    () => gate.promise,
    async () => expiring,
  );

  const flights = [run(), run(), run(), run(), run()];
  gate.resolve(rotated());
  const results = await Promise.all(flights);

  expect(calls).toHaveLength(1);
  expect(calls[0]?.refreshToken).toBe("RT-old"); // the token spent exactly once
  expect(persisted).toHaveLength(1);
  for (const result of results) expect(result).toBe(results[0]);
  expect(results[0]?.accessToken).toBe("AT-new");
});

test("a fresh result answers later serves without refreshing, until the TTL", async () => {
  const expiring = cred();
  const { calls, run } = harness(
    async () => rotated(),
    async () => expiring,
  );

  await run();
  expect(calls).toHaveLength(1);

  tick(29_000); // inside the result TTL, rotated token still valid
  await run();
  expect(calls).toHaveLength(1);

  tick(2_000); // past the TTL → the store is consulted again
  await run();
  expect(calls).toHaveLength(2);
});

test("a credential someone else already rotated is served without a refresh", async () => {
  const alreadyFresh = rotated("-elsewhere");
  const { calls, persisted, run } = harness(
    async () => {
      throw new Error("must not refresh");
    },
    async () => alreadyFresh,
  );

  await expect(run()).resolves.toBe(alreadyFresh);
  expect(calls).toHaveLength(0);
  expect(persisted).toHaveLength(0);
});

test("a rejected refresh is not cached: every caller sees it and the next retries", async () => {
  const expiring = cred();
  let attempts = 0;
  const { calls, run } = harness(
    async () => {
      attempts++;
      throw new Error(`invalid_grant #${attempts}`);
    },
    async () => expiring,
  );

  const flights = [run(), run(), run()];
  const settled = await Promise.allSettled(flights);
  for (const s of settled) {
    expect(s.status).toBe("rejected");
    expect((s as PromiseRejectedResult).reason).toBeInstanceOf(Error);
  }
  expect(calls).toHaveLength(1);

  await expect(run()).rejects.toThrow("invalid_grant #2");
  expect(calls).toHaveLength(2);
});

test("two acting identities refresh independently", async () => {
  const expiring = cred();
  const { calls, run } = harness(
    async () => rotated(),
    async () => expiring,
  );

  // {"sub":"u1"} / {"sub":"u2"} payloads → distinct credential scope keys.
  await Promise.all([
    run({ actingAs: "h.eyJzdWIiOiJ1MSJ9.s" }),
    run({ actingAs: "h.eyJzdWIiOiJ1MiJ9.s" }),
  ]);

  expect(calls).toHaveLength(2);
});

test("forget drops a cached result so the next serve refreshes again", async () => {
  const expiring = cred();
  const { coalescer, calls, run } = harness(
    async () => rotated(),
    async () => expiring,
  );

  await run();
  await run();
  expect(calls).toHaveLength(1);

  coalescer.forget("w1", "openai-codex");
  await run();
  expect(calls).toHaveLength(2);
});

test("a credential deleted mid-flight is never refreshed back into existence", async () => {
  // The user hit Disconnect while a refresh was queued. Refreshing the copy the
  // caller read, then persisting it, RECREATES the row they just deleted — and
  // hands their agents a live token for a connection they revoked.
  const gate = deferred<WorkspaceCredential>();
  const reading = deferred<void>();
  let stored: WorkspaceCredential | null = cred();
  const { calls, persisted, run } = harness(
    () => gate.promise,
    async () => {
      await reading.promise;
      return stored;
    },
  );

  const flight = run();
  stored = null; // Disconnect lands before the critical section re-reads.
  reading.resolve();

  await expect(flight).rejects.toBeInstanceOf(CredentialGoneError);
  expect(calls).toHaveLength(0);
  expect(persisted).toHaveLength(0);
});

test("forget never evicts a live flight, so single-flight survives it", async () => {
  // disconnect.ts awaits store I/O before calling forget(). A new serve can open
  // a flight in that window; evicting it would let the NEXT serve open a second
  // concurrent exchange against the same rotating refresh token.
  const gate = deferred<WorkspaceCredential>();
  const expiring = cred();
  const { coalescer, calls, run } = harness(
    () => gate.promise,
    async () => expiring,
  );

  const first = run();
  coalescer.forget("w1", "openai-codex"); // the late disconnect cleanup
  const second = run();

  gate.resolve(rotated());
  expect(await second).toBe(await first);
  expect(calls).toHaveLength(1);
});

test("a settled flight only clears its own slot, never a successor's", async () => {
  const first = deferred<WorkspaceCredential>();
  const second = deferred<WorkspaceCredential>();
  const expiring = cred();
  const gates = [first, second];
  const { coalescer, calls, run } = harness(
    () => (gates.shift() ?? second).promise,
    async () => expiring,
  );

  const a = run();
  coalescer.reset(); // A's slot is dropped wholesale while A is still running
  const b = run(); // B claims a fresh slot for the same key

  first.reject(new Error("A lost"));
  await expect(a).rejects.toThrow("A lost");

  const c = run(); // must join B rather than open a THIRD exchange
  second.resolve(rotated());
  expect(await c).toBe(await b);
  expect(calls).toHaveLength(2);
});

test("caching a result sweeps entries that aged past the TTL", async () => {
  // The cache holds full credentials (access AND refresh tokens). Without a
  // sweep it grows one entry per (workspace, scope, provider) ever served and
  // keeps live secrets in memory for the life of the process.
  const expiring = cred();
  const { coalescer, run } = harness(
    async () => rotated(),
    async () => expiring,
  );
  const cache = (coalescer as unknown as { results: Map<string, unknown> })
    .results;

  await run({ actingAs: "h.eyJzdWIiOiJ1MSJ9.s" });
  expect(cache.size).toBe(1);

  tick(31_000); // u1's entry is now stale
  await run({ actingAs: "h.eyJzdWIiOiJ1MiJ9.s" });
  expect([...cache.keys()]).toHaveLength(1); // u1 swept, only u2 remains
});

test("run forwards its refresh options to the refresher", async () => {
  const seen: unknown[] = [];
  const coalescer = new CredentialRefreshCoalescer(async (c, opts) => {
    seen.push(opts);
    return { ...c, accessToken: "AT-new", expiresAt: clock + 3_600_000 };
  }, now);
  const sleep = async () => {};
  await coalescer.run({
    workspaceId: "w1",
    provider: "openai-codex",
    load: async () => cred(),
    persist: async () => {},
    refreshOpts: { sleep },
  });
  expect(seen).toEqual([{ sleep }]);
});

test("a per-call doRefresh override replaces the constructor's refresher", async () => {
  const { coalescer } = harness(
    async () => {
      throw new Error("the default refresher must not run");
    },
    async () => cred(),
  );
  const result = await coalescer.run({
    workspaceId: "w1",
    provider: "openai-codex",
    load: async () => cred(),
    persist: async () => {},
    doRefresh: async (c) => ({
      ...c,
      accessToken: "AT-injected",
      expiresAt: clock + 3_600_000,
    }),
  });
  expect(result.accessToken).toBe("AT-injected");
});
