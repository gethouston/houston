import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  LocalDirStore,
  parsePrefetchedObjects,
} from "@houston/runtime-client/object-sync";
import { expect, test } from "vitest";
import { fakePoolStore, POOL_STORE_URL } from "./pool-store.test-support";
import { startTurnRequestFilesystem } from "./turn-claimed-hydration";
import { DeferredFilesAbandonedError } from "./turn-deferred-watch";
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

/** A pod-store that never answers the listing of the agent's own folders
 *  until the request is aborted. */
const stallFolders = (url: URL, init?: RequestInit) =>
  url.searchParams.get("prefix")?.endsWith("/.repo-site")
    ? new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason),
        );
      })
    : undefined;

/** The gateway's prefetch: the store's manifest without other
 *  conversations' transcripts and sessions, nothing inlined. */
async function shortManifest(pool: ReturnType<typeof fakePoolStore>) {
  const response = await pool.fetchImpl(
    `${POOL_STORE_URL}/v1/pod/store/org/agent/manifest`,
  );
  const { objects } = (await response.json()) as { objects: { key: string }[] };
  const other =
    /\/\.houston\/runtime\/(conversations\/(?!c1\.)|sessions\/(?!c1\/))/;
  return parsePrefetchedObjects({
    manifest: objects.filter(({ key }) => !other.test(key)),
    objects: {},
  });
}

async function claimedTurn(opts: { stall?: boolean; prefetch?: boolean } = {}) {
  const pool = fakePoolStore("ws/org/agent");
  pool.put(`${A}/CLAUDE.md`, "# Bob\n");
  pool.put(`${A}/.houston/activity/activity.json`, "[]");
  pool.put(
    `${R}/conversations/c1.json`,
    JSON.stringify({ id: "c1", messages: [] }),
  );
  pool.put(`${R}/sessions/c1/1.jsonl`, "{}\n");
  pool.put(`${R}/conversations/c1.archive/1.json`, "{}");
  for (let n = 0; n < 30; n++) {
    pool.put(`${R}/conversations/routine-${n}.json`, "{}");
    pool.put(`${R}/sessions/routine-${n}/1.jsonl`, "{}\n");
  }
  pool.put(`${A}/.repo-site/README.md`, "clone\n");
  const manifests: string[] = [];
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/manifest")) manifests.push(url.search);
    const stalled = opts.stall ? stallFolders(url, init) : undefined;
    return stalled ?? pool.fetchImpl(input, init);
  }) as typeof fetch;
  const prefetch = opts.prefetch ? await shortManifest(pool) : undefined;
  const turn = {
    gcsPrefix: "ws/org/agent",
    claim: CLAIM,
    hostToken: "host",
    conversationId: "c1",
    ...(prefetch ? { prefetch } : {}),
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
  if (!opts.stall) await filesystem.workspaceReady;
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

test("sync never deletes or overwrites another conversation's files, and creates new files create-only", async () => {
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

test("a turn that abandons its files never waits on their listing to sync its transcript", async () => {
  const { pool, filesystem, sync, local } = await claimedTurn({ stall: true });
  writeFileSync(
    local(`${R}/conversations/c1.json`),
    JSON.stringify({ id: "c1", messages: [{ role: "user", content: "hi" }] }),
  );
  filesystem.abandonDeferred?.();
  await expect(filesystem.workspaceReady).rejects.toBeInstanceOf(
    DeferredFilesAbandonedError,
  );
  const result = await sync();
  expect(result.uploaded).toEqual([`${R}/conversations/c1.json`]);
  expect(pool.read(`${R}/conversations/c1.json`)).toContain("hi");
});

test("a prefetched manifest without other conversations hydrates the turn's own and syncs without touching the rest", async () => {
  const { pool, manifests, filesystem, sync, local } = await claimedTurn({
    prefetch: true,
  });
  // The prefetched manifest was the listing: the store was never listed.
  expect(manifests).toEqual([]);
  for (const own of [
    `${R}/conversations/c1.json`,
    `${R}/conversations/c1.archive/1.json`,
    `${R}/sessions/c1/1.jsonl`,
  ]) {
    expect(existsSync(local(own))).toBe(true);
    expect(filesystem.manifest.get(own)?.generation).toBe("1");
  }
  expect(existsSync(local(`${R}/conversations/routine-3.json`))).toBe(false);
  expect(existsSync(local(`${A}/.repo-site/README.md`))).toBe(true);

  writeFileSync(
    local(`${R}/conversations/c1.json`),
    '{"id":"c1","messages":[1]}',
  );
  writeFileSync(local(`${R}/sessions/c1/1.jsonl`), "{}\n{}\n");
  mkdirSync(dirname(local(`${R}/sessions/routine-3/1.jsonl`)), {
    recursive: true,
  });
  writeFileSync(local(`${R}/conversations/routine-3.json`), "clobbered");
  writeFileSync(local(`${R}/sessions/routine-3/1.jsonl`), "clobbered\n");
  const result = await sync();
  expect(
    pool.writes.map(({ method, key, ifGenerationMatch }) => [
      method,
      key,
      ifGenerationMatch,
    ]),
  ).toEqual([
    ["PUT", `${R}/conversations/c1.json`, "1"],
    ["PUT", `${R}/sessions/c1/1.jsonl`, "1"],
  ]);
  expect(result.deleted).toEqual([]);
  expect(result.outOfScope).toBe(2);
  expect(pool.read(`${R}/conversations/routine-3.json`)).toBe("{}");
  expect(
    (await pool.keys()).filter((key) => key.includes("routine-")),
  ).toHaveLength(60);
});
