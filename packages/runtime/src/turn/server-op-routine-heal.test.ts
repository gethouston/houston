import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { afterEach, expect, test } from "vitest";
import { ROUTINE_HEAL_BUDGET_MS } from "./op-routine-heal";
import {
  fakePoolStore,
  HEARTBEAT_URL,
  POOL_STORE_URL,
} from "./pool-store.test-support";
import { createTurnServer } from "./server";
import type { TurnRunner } from "./turn-session";

/**
 * A routine write against a routine the store no longer holds (HOUSTON-APP-5JZ
 * / 5K0): the caller picked it from the gateway's stale asleep mirror of the
 * routines doc. The worker relays the host's 404 untouched and re-projects the
 * routines doc from the store, announcing `RoutinesChanged` once it landed so
 * every member's list drops the ghost.
 */

const servers: Server[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

const noopTurn: TurnRunner = async () => ({});
const PREFIX = "ws/acme/bob";
const ROUTINES_KEY = "workspaces/Personal/Bob/.houston/routines/routines.json";
const LIVE = {
  id: "r-live",
  name: "Digest",
  prompt: "p",
  schedule: "0 9 * * *",
  enabled: true,
};

/** The doc route never answers a PUT until the request is aborted. */
function hangingPut(init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const signal = init?.signal;
    if (signal?.aborted) return reject(signal.reason);
    signal?.addEventListener("abort", () => reject(signal.reason));
  });
}

async function worker(
  options: { failDocs?: boolean; hangPuts?: boolean; mirror?: unknown[] } = {},
) {
  const pool = fakePoolStore(PREFIX);
  pool.put("workspaces/Personal/Bob/CLAUDE.md", "# Bob\n");
  pool.put(ROUTINES_KEY, JSON.stringify([LIVE]));
  // The gateway's asleep mirror still lists the deleted routine.
  pool.docs.set("routines", {
    doc: options.mirror ?? [LIVE, { ...LIVE, id: "r-ghost" }],
    revision: 1,
  });
  const fetchImpl = (async (input: unknown, init?: RequestInit) => {
    const isDoc = String(input).includes("/v1/pod/docs/");
    if (options.failDocs && isDoc)
      return new Response("unavailable", { status: 503 });
    if (options.hangPuts && isDoc && init?.method === "PUT")
      return hangingPut(init);
    return pool.fetchImpl(input as RequestInfo, init);
  }) as typeof fetch;
  const server = createTurnServer({
    store: new LocalDirStore(pool.root),
    token: "",
    runTurn: noopTurn,
    poolStoreUrl: POOL_STORE_URL,
    fetchImpl,
    activityDocRetryDelaysMs: [],
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, pool };
}

async function postRoute(
  base: string,
  method: string,
  rest: string,
  body = "",
) {
  const envelope = {
    workspaceId: "acme",
    agentId: "bob",
    gcsPrefix: PREFIX,
    hostToken: "host-token",
    claim: {
      id: "claim-1",
      bootId: "boot-1",
      token: "claim-token",
      heartbeatUrl: HEARTBEAT_URL,
    },
    actingAs: { userId: "user-1" },
    triggersEnabled: false,
    op: { kind: "route", method, rest, body, contentType: "application/json" },
  };
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${base}/op`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
    });
    const json = (await response.json()) as Record<string, unknown>;
    if (json.error !== "worker_full" || attempt > 40) return json;
    await new Promise((r) => setTimeout(r, 25));
  }
}

test.each([
  ["PATCH", JSON.stringify({ name: "x" })],
  ["DELETE", ""],
])(
  "a %s of a routine the store lacks heals the routines doc",
  async (method, body) => {
    const { base, pool } = await worker();
    const json = await postRoute(base, method, "routines/r-ghost", body);
    expect(json.status, JSON.stringify(json)).toBe(404);
    expect(JSON.parse(json.body as string)).toEqual({
      error: "routine not found",
      code: "routine_not_found",
    });
    expect(json.events).toEqual(["RoutinesChanged"]);
    const puts = pool.docPuts.filter((p) => p.family === "routines");
    expect(puts).toHaveLength(1);
    expect(puts[0]?.claim).toBe("agent-ops");
    expect(JSON.stringify(puts[0]?.doc)).toContain("r-live");
    expect(JSON.stringify(puts[0]?.doc)).not.toContain("r-ghost");
    // Nothing was written: the store tree is untouched.
    expect(pool.writes).toEqual([]);
    expect(JSON.parse(pool.read(ROUTINES_KEY))).toEqual([LIVE]);
  },
);

test("a heal whose doc never lands announces nothing", async () => {
  const { base, pool } = await worker({ failDocs: true });
  const json = await postRoute(base, "DELETE", "routines/r-ghost");
  expect(json.status, JSON.stringify(json)).toBe(404);
  expect(json.events).toEqual([]);
  expect(pool.writes).toEqual([]);
});

test("another 404 re-projects nothing", async () => {
  const { base, pool } = await worker();
  const json = await postRoute(
    base,
    "PATCH",
    "activities/no-such-mission",
    "{}",
  );
  expect(json.status, JSON.stringify(json)).toBe(404);
  expect(json.events).toEqual([]);
  expect(pool.docPuts).toEqual([]);
});

test("a successful write still projects through the durable path, once", async () => {
  const { base, pool } = await worker();
  const json = await postRoute(base, "DELETE", "routines/r-live");
  expect(json.status, JSON.stringify(json)).toBe(200);
  expect(json.events).toEqual(["RoutinesChanged"]);
  const puts = pool.docPuts.filter((p) => p.family === "routines");
  expect(puts).toHaveLength(1);
  expect(JSON.stringify(puts[0]?.doc)).not.toContain("r-live");
});

test("a mirror that no longer lists the routine is left alone", async () => {
  const { base, pool } = await worker({ mirror: [LIVE] });
  const json = await postRoute(base, "DELETE", "routines/r-ghost");
  expect(json.status, JSON.stringify(json)).toBe(404);
  expect(json.events).toEqual([]);
  expect(pool.docPuts).toEqual([]);
});

test("a doc PUT that never answers gives up within the heal budget", async () => {
  const { base, pool } = await worker({ hangPuts: true });
  const started = Date.now();
  const json = await postRoute(base, "DELETE", "routines/r-ghost");
  expect(Date.now() - started).toBeLessThan(ROUTINE_HEAL_BUDGET_MS + 1_500);
  expect(json.status, JSON.stringify(json)).toBe(404);
  expect(json.events).toEqual([]);
  expect(pool.docPuts).toEqual([]);
});
