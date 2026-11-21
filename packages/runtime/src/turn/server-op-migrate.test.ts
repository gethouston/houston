import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { AGENT_STORE_MIGRATION_VERSION } from "@houston/host/src/migrate/agent-store";
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

const noopTurn: TurnRunner = async () => ({});
const PREFIX = "ws/acme/ledger";
const AGENT = "workspaces/Personal/Ledger";
const OLD_ROUTINE = {
  id: "r1",
  name: "Old digest",
  prompt: "summarize",
  schedule: "0 9 * * *",
};

async function worker() {
  const pool = fakePoolStore(PREFIX);
  pool.put(`${AGENT}/CLAUDE.md`, "# Ledger\n");
  const server = createTurnServer({
    store: new LocalDirStore(pool.root),
    token: "",
    runTurn: noopTurn,
    poolStoreUrl: POOL_STORE_URL,
    fetchImpl: pool.fetchImpl,
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = async (op: Record<string, unknown>) => {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(`${base}/op`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: "acme",
          agentId: "ledger",
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
          op,
        }),
      });
      const json = (await response.json()) as Record<string, unknown>;
      if (json.error !== "worker_full" || attempt > 40) return json;
      await new Promise((r) => setTimeout(r, 25));
    }
  };
  return { pool, post };
}

function legacyAgent(pool: ReturnType<typeof fakePoolStore>) {
  pool.put(`${AGENT}/.houston/routines.json`, JSON.stringify([OLD_ROUTINE]));
  pool.put(
    `${AGENT}/.houston/activity.json`,
    '[{"id":"a1","title":"Old","status":"done"}]',
  );
}

const createRoutine = {
  kind: "route",
  method: "POST",
  rest: "routines",
  contentType: "application/json",
  body: JSON.stringify({
    name: "New digest",
    prompt: "p",
    schedule: "0 8 * * *",
  }),
};

const migrate = (extra: Record<string, unknown> = {}) => ({
  kind: "migrate",
  version: AGENT_STORE_MIGRATION_VERSION,
  ...extra,
});

const routines = (pool: ReturnType<typeof fakePoolStore>) =>
  JSON.parse(pool.read(`${AGENT}/.houston/routines/routines.json`)) as {
    id: string;
    created_by?: string;
  }[];

test("a write op on a flat-layout agent declines before it can hide the old routines", async () => {
  const { pool, post } = await worker();
  legacyAgent(pool);

  const json = await post(createRoutine);

  expect(json).toEqual({
    ok: true,
    decline: true,
    reason: "agent_not_migrated",
  });
  expect(pool.writes).toEqual([]);
  expect(await pool.keys()).not.toContain(
    `${AGENT}/.houston/routines/routines.json`,
  );
});

test("the migrate op moves the flat layout forward and the next write keeps every routine", async () => {
  const { pool, post } = await worker();
  legacyAgent(pool);

  const migrated = await post(migrate({ ownerSub: "owner-1" }));

  expect(migrated.status, JSON.stringify(migrated)).toBe(200);
  expect(JSON.parse(migrated.body as string)).toMatchObject({
    version: AGENT_STORE_MIGRATION_VERSION,
    layoutFiles: 2,
    routinesStamped: 1,
  });
  expect(routines(pool)).toEqual([{ ...OLD_ROUTINE, created_by: "owner-1" }]);
  expect(pool.read(`${AGENT}/.houston/routines.json`)).toBe(
    JSON.stringify([OLD_ROUTINE]),
  );
  for (const write of pool.writes) expect(write.claim).toBe("agent-ops");

  const created = await post(createRoutine);
  expect(created.status, JSON.stringify(created)).toBe(201);
  expect(routines(pool).map((r) => r.id)).toContain("r1");
  expect(routines(pool)).toHaveLength(2);
});

test("the migrate op backfills the family docs from the migrated files", async () => {
  const { pool, post } = await worker();
  legacyAgent(pool);

  await post(migrate({ ownerSub: "owner-1" }));

  expect(pool.docs.get("routines")?.doc).toEqual([
    expect.objectContaining({ id: "r1", created_by: "owner-1" }),
  ]);
  expect(pool.docs.get("activity")?.doc).toEqual([
    expect.objectContaining({ id: "a1", title: "Old" }),
  ]);
  for (const put of pool.docPuts) expect(put.claim).toBe("agent-ops");
});

test("a second migrate op changes nothing: no file, no doc, only the routines re-projection", async () => {
  const { pool, post } = await worker();
  legacyAgent(pool);
  await post(migrate({ ownerSub: "owner-1" }));
  pool.writes.length = 0;
  pool.docPuts.length = 0;

  const again = await post(migrate({ ownerSub: "owner-1" }));

  expect(again.status, JSON.stringify(again)).toBe(200);
  expect(JSON.parse(again.body as string)).toMatchObject({
    layoutFiles: 0,
    schemaFiles: 0,
    setupSections: 0,
    routinesStamped: 0,
    secretsMoved: 0,
  });
  expect(pool.docPuts).toEqual([]);
  expect(pool.writes).toEqual([
    {
      method: "PUT",
      key: `${AGENT}/.houston/routines/routines.json`,
      claim: "agent-ops",
      ifGenerationMatch: "1",
    },
  ]);
});

test("a worker older than the asked version refuses and writes nothing", async () => {
  const { pool, post } = await worker();
  legacyAgent(pool);

  const json = await post(
    migrate({ version: AGENT_STORE_MIGRATION_VERSION + 1 }),
  );

  expect(json.status).toBe(409);
  expect(JSON.parse(json.body as string)).toEqual({
    code: "migration_version_unsupported",
    version: AGENT_STORE_MIGRATION_VERSION,
  });
  expect(pool.writes).toEqual([]);
});

test("plaintext custom-integration secrets move to custody without replacing a newer value", async () => {
  const { pool, post } = await worker();
  pool.put(
    "custom-integration-secrets.json",
    JSON.stringify({ ci_crm_KEY: "plain", ci_mail_KEY: "stale" }),
  );
  pool.secrets.set("ci_mail_KEY", "rotated");

  const json = await post(migrate());

  expect(json.status, JSON.stringify(json)).toBe(200);
  expect(JSON.parse(json.body as string)).toMatchObject({ secretsMoved: 1 });
  expect(pool.secrets.get("ci_crm_KEY")).toBe("plain");
  expect(pool.secrets.get("ci_mail_KEY")).toBe("rotated");
  expect(await pool.keys()).not.toContain("custom-integration-secrets.json");
});
