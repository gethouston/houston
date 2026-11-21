import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalWorkspaceStore } from "@houston/host/src/store/local";
import type { RoutineRun } from "@houston/protocol";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { afterEach, expect, test } from "vitest";
import {
  fakePoolStore,
  HEARTBEAT_URL,
  POOL_STORE_URL,
} from "./pool-store.test-support";
import { createTurnServer } from "./server";
import type { TurnRunner } from "./turn-session";

const servers: Server[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const noopTurn: TurnRunner = async () => ({});
const PREFIX = "ws/w1/agent-1";
const STARTED = "2026-10-01T09:00:00.000Z";

async function seedAgent(runs: RoutineRun[] | null) {
  const storeRoot = mkdtempSync(join(tmpdir(), "op-run-cancel-"));
  const workspaces = join(storeRoot, PREFIX, "workspaces");
  const hostStore = new LocalWorkspaceStore(workspaces);
  const ws = await hostStore.getOrCreatePersonalWorkspace("alice");
  const agent = await hostStore.createAgent({
    workspaceId: ws.id,
    name: "Bob",
  });
  const agentDir = join(workspaces, ...agent.id.split("/"));
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(join(agentDir, "CLAUDE.md"), "# Bob\n");
  const runsFile = join(
    agentDir,
    ".houston",
    "routine_runs",
    "routine_runs.json",
  );
  if (runs) {
    mkdirSync(join(agentDir, ".houston", "routine_runs"), { recursive: true });
    writeFileSync(runsFile, JSON.stringify(runs));
  }
  const base = await listen(
    createTurnServer({
      store: new LocalDirStore(storeRoot),
      token: "",
      runTurn: noopTurn,
    }),
  );
  const storedRuns = (): RoutineRun[] =>
    JSON.parse(readFileSync(runsFile, "utf8")) as RoutineRun[];
  return { base, storedRuns };
}

async function heartbeatOK(): Promise<string> {
  return listen(
    createServer((_req, res) => {
      res.writeHead(200);
      res.end("{}");
    }),
  );
}

async function postOp(base: string, op: Record<string, unknown>) {
  const envelope = {
    workspaceId: "w1",
    agentId: "agent-1",
    gcsPrefix: PREFIX,
    hostToken: "host-token",
    claim: {
      id: "claim-1",
      bootId: "boot-1",
      token: "claim-token",
      heartbeatUrl: await heartbeatOK(),
    },
    actingAs: { userId: "user-1" },
    triggersEnabled: false,
    op,
  };
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${base}/op`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
    });
    const json = (await response.json()) as Record<string, unknown>;
    if (json.error !== "worker_full" || attempt > 40)
      return { status: response.status, json };
    await new Promise((r) => setTimeout(r, 25));
  }
}

function postCancel(base: string, routineId: string, runId: string, body = "") {
  return postOp(base, {
    kind: "route",
    method: "POST",
    rest: `routines/${routineId}/runs/${runId}/cancel`,
    body,
    contentType: "application/json",
  });
}

const running: RoutineRun = {
  id: "run-1",
  routine_id: "r1",
  status: "running",
  session_key: "routine-r1",
  started_at: STARTED,
};

test("a running row settles as cancelled and the change is announced", async () => {
  const { base, storedRuns } = await seedAgent([running]);
  const { status, json } = await postCancel(base, "r1", "run-1");
  expect(status, JSON.stringify(json)).toBe(200);
  expect(json.status).toBe(200);
  const answered = JSON.parse(json.body as string) as RoutineRun;
  expect(answered).toMatchObject({
    id: "run-1",
    status: "cancelled",
    summary: "Stopped by user",
  });
  expect(answered.completed_at).toBeTruthy();
  expect(json.events).toEqual(["RoutineRunsChanged"]);
  expect(storedRuns()).toEqual([answered]);
});

test("a stopped pooled run with no stored row records its one cancelled row", async () => {
  const older: RoutineRun = {
    ...running,
    id: "run-0",
    status: "silent",
    started_at: "2026-09-30T09:00:00.000Z",
    completed_at: "2026-09-30T09:01:00.000Z",
  };
  const { base, storedRuns } = await seedAgent([older]);
  const stopped = JSON.stringify({
    stopped: { sessionKey: "routine-r1", startedAt: STARTED },
  });
  const { json } = await postCancel(base, "r1", "run-2", stopped);
  expect(json.status, String(json.body)).toBe(200);
  const answered = JSON.parse(json.body as string) as RoutineRun;
  expect(answered).toMatchObject({
    id: "run-2",
    routine_id: "r1",
    status: "cancelled",
    session_key: "routine-r1",
    started_at: STARTED,
    summary: "Stopped by user",
  });
  expect(json.events).toEqual(["RoutineRunsChanged"]);
  expect(storedRuns().map((r) => r.id)).toEqual(["run-2", "run-0"]);
});

test("a stopped run with no runs file yet starts the history", async () => {
  const { base, storedRuns } = await seedAgent(null);
  const stopped = JSON.stringify({
    stopped: { sessionKey: "routine-r1-run-3", startedAt: STARTED },
  });
  const { json } = await postCancel(base, "r1", "run-3", stopped);
  expect(json.status, String(json.body)).toBe(200);
  expect(storedRuns()).toMatchObject([
    { id: "run-3", status: "cancelled", session_key: "routine-r1-run-3" },
  ]);
});

test("a finished run is a no-op: the pod's 409, the row untouched, nothing announced", async () => {
  const finished: RoutineRun = {
    ...running,
    status: "surfaced",
    completed_at: "2026-10-01T09:05:00.000Z",
  };
  const { base, storedRuns } = await seedAgent([finished]);
  const stopped = JSON.stringify({
    stopped: { sessionKey: "routine-r1", startedAt: STARTED },
  });
  for (const body of ["", stopped]) {
    const { json } = await postCancel(base, "r1", "run-1", body);
    expect(json.status).toBe(409);
    expect(JSON.parse(json.body as string)).toEqual({
      error: "run is not running",
    });
    expect(json.events).toEqual([]);
  }
  expect(storedRuns()).toEqual([finished]);
});

test("a double cancel settles the row once and answers the pod's 409 the second time", async () => {
  const { base, storedRuns } = await seedAgent([running]);
  const first = await postCancel(base, "r1", "run-1");
  expect(first.json.status).toBe(200);
  const settled = storedRuns();
  const again = await postCancel(base, "r1", "run-1");
  expect(again.json.status).toBe(409);
  expect(storedRuns()).toEqual(settled);
  expect(settled).toHaveLength(1);
});

test("an unknown run with no stop behind it is the pod's 404", async () => {
  const { base } = await seedAgent([running]);
  const { json } = await postCancel(base, "r1", "nope");
  expect(json.status).toBe(404);
  expect((await postCancel(base, "r2", "run-1")).json.status).toBe(404);
});

test("a stop naming another routine's conversation is refused before any write", async () => {
  const { base, storedRuns } = await seedAgent([running]);
  for (const stopped of [
    { sessionKey: "routine-r2", startedAt: STARTED },
    { sessionKey: "chat-1", startedAt: STARTED },
    { sessionKey: "routine-r1", startedAt: "yesterday" },
    "yes",
  ]) {
    const { json } = await postCancel(
      base,
      "r1",
      "run-9",
      JSON.stringify({ stopped }),
    );
    expect(json.status).toBe(400);
  }
  expect(storedRuns()).toEqual([running]);
});

test("firing a run is never an op: the gateway's run-now dispatches a turn", async () => {
  const { base } = await seedAgent([running]);
  const { status, json } = await postOp(base, {
    kind: "route",
    method: "POST",
    rest: "routines/r1/run",
    body: "",
    contentType: "application/json",
  });
  expect(status).toBe(400);
  expect(String(json.error)).toContain("not an op route");
});

test("the run history doc the gateway serves asleep gets the cancelled row, under the ops claim", async () => {
  const prefix = "ws/acme/bob";
  const runsKey =
    "workspaces/Personal/Bob/.houston/routine_runs/routine_runs.json";
  const pool = fakePoolStore(prefix);
  pool.put("workspaces/Personal/Bob/CLAUDE.md", "# Bob\n");
  pool.put(runsKey, JSON.stringify([running]));
  const docs: { url: string; claim: string | null; body: string }[] = [];
  const fetchImpl = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/v1/pod/docs/") && init?.method === "PUT")
      docs.push({
        url,
        claim: new Headers(init.headers).get("X-Houston-Claim-Conversation"),
        body: String(init.body),
      });
    return pool.fetchImpl(input as RequestInfo, init);
  }) as typeof fetch;
  const base = await listen(
    createTurnServer({
      store: new LocalDirStore(pool.root),
      token: "",
      runTurn: noopTurn,
      poolStoreUrl: POOL_STORE_URL,
      fetchImpl,
    }),
  );
  const response = await fetch(`${base}/op`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId: "acme",
      agentId: "bob",
      gcsPrefix: prefix,
      hostToken: "host-token",
      claim: {
        id: "claim-1",
        bootId: "boot-1",
        token: "claim-token",
        heartbeatUrl: HEARTBEAT_URL,
      },
      triggersEnabled: false,
      op: {
        kind: "route",
        method: "POST",
        rest: "routines/r1/runs/run-1/cancel",
        body: "",
        contentType: "application/json",
      },
    }),
  });
  const json = (await response.json()) as Record<string, unknown>;
  expect(json.status, JSON.stringify(json)).toBe(200);
  expect(json.events).toEqual(["RoutineRunsChanged"]);
  expect(JSON.parse(pool.read(runsKey))).toMatchObject([
    { id: "run-1", status: "cancelled" },
  ]);
  const runsDoc = docs.find((d) => d.url.includes("routine_runs"));
  expect(runsDoc?.claim).toBe("agent-ops");
  expect(JSON.parse(runsDoc?.body ?? "null")).toMatchObject({
    doc: [{ id: "run-1", status: "cancelled" }],
  });
});

test("a vouched-for row joins the history in start order and never evicts a newer run", async () => {
  const settledAt = (i: number) =>
    new Date(Date.parse(STARTED) + (i + 1) * 60_000).toISOString();
  const newer: RoutineRun[] = Array.from({ length: 50 }, (_, i) => ({
    id: `run-n${49 - i}`,
    routine_id: "r1",
    status: "silent",
    session_key: "routine-r1",
    started_at: settledAt(49 - i),
    completed_at: settledAt(49 - i),
  }));
  const { base, storedRuns } = await seedAgent(newer);
  const old = JSON.stringify({
    stopped: { sessionKey: "routine-r1", startedAt: STARTED },
  });
  const { json } = await postCancel(base, "r1", "run-old", old);
  expect(json.status).toBe(409);
  expect(storedRuns()).toEqual(newer);

  const { base: base2, storedRuns: stored2 } = await seedAgent(
    newer.slice(0, 3),
  );
  const between = JSON.stringify({
    stopped: {
      sessionKey: "routine-r1",
      startedAt: new Date(Date.parse(settledAt(48)) + 30_000).toISOString(),
    },
  });
  expect((await postCancel(base2, "r1", "run-mid", between)).json.status).toBe(
    200,
  );
  expect(stored2().map((r) => r.id)).toEqual([
    "run-n49",
    "run-mid",
    "run-n48",
    "run-n47",
  ]);
});

test("a JSON null body is the 400 a bad stop gets, never a handler failure", async () => {
  const { base, storedRuns } = await seedAgent([running]);
  const { json } = await postCancel(base, "r1", "run-1", "null");
  expect(json.status).toBe(400);
  expect(storedRuns()).toEqual([running]);
});

test("an unreadable start elsewhere in the history never lets an old stop evict a newer run", async () => {
  const at = (minutes: number) =>
    new Date(Date.parse(STARTED) + minutes * 60_000).toISOString();
  const legacy = {
    id: "legacy",
    routine_id: "r2",
    status: "silent",
    session_key: "routine-r2",
    started_at: "",
  } as RoutineRun;
  const newer: RoutineRun[] = Array.from({ length: 50 }, (_, i) => ({
    id: `run-n${50 - i}`,
    routine_id: "r1",
    status: "silent",
    session_key: "routine-r1",
    started_at: at(50 - i),
  }));
  const { base, storedRuns } = await seedAgent([legacy, ...newer]);
  const old = JSON.stringify({
    stopped: { sessionKey: "routine-r1", startedAt: STARTED },
  });
  expect((await postCancel(base, "r1", "run-old", old)).json.status).toBe(409);
  expect(storedRuns()).toEqual([legacy, ...newer]);
});

test("a JSON array body is refused like any other body that is not an object", async () => {
  const { base, storedRuns } = await seedAgent([running]);
  expect((await postCancel(base, "r1", "run-1", "[]")).json.status).toBe(400);
  expect(storedRuns()).toEqual([running]);
});
