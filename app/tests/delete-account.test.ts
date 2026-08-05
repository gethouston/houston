import assert from "node:assert/strict";
import { test } from "node:test";
import { purgeHoustonLocalState } from "../src/lib/houston-local-state.ts";
import {
  AccountDeletionError,
  accountDeletionAvailable,
  requestAccountDeletion,
} from "../src/lib/identity/delete-account.ts";

// ── requestAccountDeletion ────────────────────────────────────────────

interface Sent {
  url: string;
  bearer: string | null;
}

function fakeFetch(statuses: number[], sent: Sent[]): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    sent.push({
      url: String(input),
      bearer: headers.get("Authorization"),
    });
    const status = statuses.shift() ?? 500;
    return new Response(null, { status });
  };
}

test("204 resolves and sends the live bearer to /v1/me", async () => {
  const sent: Sent[] = [];
  await requestAccountDeletion({
    baseUrl: "https://gw.example/",
    token: () => "tok-1",
    refresh: async () => null,
    fetchFn: fakeFetch([204], sent),
  });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, "https://gw.example/v1/me");
  assert.equal(sent[0].bearer, "Bearer tok-1");
});

test("401 refreshes once and replays with the fresh bearer", async () => {
  const sent: Sent[] = [];
  let refreshes = 0;
  await requestAccountDeletion({
    baseUrl: "https://gw.example",
    token: () => "stale",
    refresh: async () => {
      refreshes++;
      return "fresh";
    },
    fetchFn: fakeFetch([401, 204], sent),
  });
  assert.equal(refreshes, 1);
  assert.deepEqual(
    sent.map((s) => s.bearer),
    ["Bearer stale", "Bearer fresh"],
  );
});

test("401 with no refreshable session throws http(401)", async () => {
  await assert.rejects(
    requestAccountDeletion({
      baseUrl: "https://gw.example",
      token: () => "stale",
      refresh: async () => null,
      fetchFn: fakeFetch([401], []),
    }),
    (e: unknown) =>
      e instanceof AccountDeletionError &&
      e.kind === "http" &&
      e.httpStatus === 401,
  );
});

test("409 maps to the non-retryable team_member failure", async () => {
  await assert.rejects(
    requestAccountDeletion({
      baseUrl: "https://gw.example",
      token: () => "tok",
      refresh: async () => null,
      fetchFn: fakeFetch([409], []),
    }),
    (e: unknown) =>
      e instanceof AccountDeletionError && e.kind === "team_member",
  );
});

test("5xx maps to a retryable http failure", async () => {
  await assert.rejects(
    requestAccountDeletion({
      baseUrl: "https://gw.example",
      token: () => "tok",
      refresh: async () => null,
      fetchFn: fakeFetch([500], []),
    }),
    (e: unknown) =>
      e instanceof AccountDeletionError &&
      e.kind === "http" &&
      e.httpStatus === 500,
  );
});

test("a transport reject maps to network, preserving the cause", async () => {
  const boom = new Error("offline");
  await assert.rejects(
    requestAccountDeletion({
      baseUrl: "https://gw.example",
      token: () => "tok",
      refresh: async () => null,
      fetchFn: async () => {
        throw boom;
      },
    }),
    (e: unknown) =>
      e instanceof AccountDeletionError &&
      e.kind === "network" &&
      e.cause === boom,
  );
});

// ── accountDeletionAvailable ──────────────────────────────────────────

test("availability: hosted desktop and web yes; sidecar desktop and signed-out no", () => {
  const base = {
    identityConfigured: true,
    hasSession: true,
    isTauri: true,
    hostedGateway: true,
  };
  assert.equal(accountDeletionAvailable(base), true);
  // Web (managed cloud): no hosted-gateway env flag, but not Tauri either.
  assert.equal(
    accountDeletionAvailable({ ...base, isTauri: false, hostedGateway: false }),
    true,
  );
  // Desktop against the local sidecar: the engine global is NOT the gateway.
  assert.equal(
    accountDeletionAvailable({ ...base, hostedGateway: false }),
    false,
  );
  assert.equal(accountDeletionAvailable({ ...base, hasSession: false }), false);
  assert.equal(
    accountDeletionAvailable({ ...base, identityConfigured: false }),
    false,
  );
});

// ── purgeHoustonLocalState ────────────────────────────────────────────

test("purge removes only houston.* keys, surviving index renumbering", () => {
  const store = new Map<string, string>([
    ["houston.read-cursors.a", "1"],
    ["other-app.key", "keep"],
    ["houston.sidebar-layout.default", "2"],
    ["houston.cloudMigration.uid", "3"],
    ["plain", "keep"],
  ]);
  purgeHoustonLocalState({
    get length() {
      return store.size;
    },
    key(i: number) {
      return [...store.keys()][i] ?? null;
    },
    removeItem(k: string) {
      store.delete(k);
    },
  });
  assert.deepEqual([...store.keys()].sort(), ["other-app.key", "plain"]);
});
