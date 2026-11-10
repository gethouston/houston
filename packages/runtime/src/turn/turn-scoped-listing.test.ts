import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { expect, test } from "vitest";
import { fakePoolStore, POOL_STORE_URL } from "./pool-store.test-support";
import { startTurnRequestFilesystem } from "./turn-claimed-hydration";
import { syncTurnFilesystem } from "./turn-filesystem";
import { resolveTurnStore } from "./turn-store";

const A = "workspaces/W/Bob";
const R = `${A}/.houston/runtime`;
const CLAIM = {
  id: "claim-1",
  token: "token-1",
  bootId: "boot-1",
  heartbeatUrl: "https://heartbeat.test",
};

async function claimedTurn() {
  const pool = fakePoolStore("ws/org/agent");
  pool.put(`${A}/CLAUDE.md`, "# Bob\n");
  pool.put(`${A}/.houston/activity/activity.json`, "[]");
  pool.put(
    `${R}/conversations/c1.json`,
    JSON.stringify({ id: "c1", messages: [] }),
  );
  pool.put(`${R}/sessions/c1/1.jsonl`, "{}\n");
  for (let n = 0; n < 30; n++) {
    pool.put(`${R}/conversations/routine-${n}.json`, "{}");
    pool.put(`${R}/sessions/routine-${n}/1.jsonl`, "{}\n");
  }
  pool.put(`${A}/.repo-site/README.md`, "clone\n");
  const manifests: string[] = [];
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/manifest")) manifests.push(url.search);
    return pool.fetchImpl(input, init);
  }) as typeof fetch;
  const turn = {
    gcsPrefix: "ws/org/agent",
    claim: CLAIM,
    hostToken: "host",
    conversationId: "c1",
  };
  const resolved = resolveTurnStore(turn, new LocalDirStore(pool.root), {
    poolStoreUrl: POOL_STORE_URL,
    fetchImpl,
  });
  const preparation = await startTurnRequestFilesystem({
    store: resolved.store,
    prefix: resolved.prefix,
    root: mkdtempSync(join(tmpdir(), "scoped-turn-")),
    turn,
    timings: {},
  });
  const filesystem = await preparation.hydrated;
  await filesystem.workspaceReady;
  const sync = () =>
    syncTurnFilesystem({
      store: resolved.store,
      prefix: resolved.prefix,
      filesystem,
      conversationId: "c1",
      claimed: true,
    });
  const local = (rel: string) => join(filesystem.storeRoot, ...rel.split("/"));
  return { pool, manifests, filesystem, sync, local };
}

test("a claimed turn never lists the store whole or another conversation's files", async () => {
  const { manifests, filesystem, local } = await claimedTurn();
  expect(manifests).not.toContain("");
  expect(
    manifests.some((query) =>
      /prefix=[^&]*%2F(conversations|sessions)(&|$)/.test(query),
    ),
  ).toBe(false);
  expect(existsSync(local(`${R}/conversations/c1.json`))).toBe(true);
  expect(
    filesystem.manifest.get(`${R}/conversations/c1.json`)?.generation,
  ).toBe("1");
  expect(existsSync(local(`${R}/sessions/c1/1.jsonl`))).toBe(true);
  expect(existsSync(local(`${R}/conversations/routine-3.json`))).toBe(false);
  expect(existsSync(local(`${A}/.repo-site/README.md`))).toBe(true);
  expect(filesystem.listedObjects).toBeLessThan(10);
});

test("sync never deletes or overwrites what the listing left out, and creates new files create-only", async () => {
  const { pool, sync, local } = await claimedTurn();
  const put = (rel: string, body: string) => {
    mkdirSync(dirname(local(rel)), { recursive: true });
    writeFileSync(local(rel), body);
  };
  put(`${R}/conversations/routine-3.json`, "clobbered");
  put(`${R}/sessions/routine-3/1.jsonl`, "clobbered\n");
  put(`${A}/notes/new.md`, "new\n");
  const result = await sync();
  expect(pool.read(`${R}/conversations/routine-3.json`)).toBe("{}");
  expect(pool.read(`${R}/sessions/routine-3/1.jsonl`)).toBe("{}\n");
  expect(result.deleted).toEqual([]);
  expect(result.outOfScope).toBe(2);
  expect(
    pool.writes.map(({ method, key, ifGenerationMatch }) => [
      method,
      key,
      ifGenerationMatch,
    ]),
  ).toEqual([["PUT", `${A}/notes/new.md`, "0"]]);
  expect(
    (await pool.keys()).filter((key) => key.includes("routine-")),
  ).toHaveLength(60);
});
