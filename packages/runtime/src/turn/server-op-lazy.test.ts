import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalWorkspaceStore } from "@houston/host/src/store/local";
import { MAX_UPLOAD_BYTES } from "@houston/host/src/turn/files-import";
import {
  LocalDirStore,
  type ObjectStore,
  ObjectTooLargeError,
} from "@houston/runtime-client/object-sync";
import { afterEach, expect, test } from "vitest";
import { createTurnServer } from "./server";
import type { TurnRunner } from "./turn-session";

/**
 * Lazy hot-set on pool ops: a sleeping agent's Files tab and one-file reads
 * must cost the objects they touch, never the agent's size, and a
 * conversation op must hydrate only its own conversation.
 */

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

function countingStore(root: string): ObjectStore & { downloads: string[] } {
  const inner = new LocalDirStore(root);
  const downloads: string[] = [];
  return {
    downloads,
    list: (p) => inner.list(p),
    manifest: (p) => inner.manifest(p),
    download: (key, dest) => {
      downloads.push(key.slice(PREFIX.length + 1));
      return inner.download(key, dest);
    },
    upload: (src, key, o) => inner.upload(src, key, o),
    delete: (key, o) => inner.delete(key, o),
  };
}

/** A busy agent: many user files, two conversations with sessions. */
async function seedBusyAgent() {
  const storeRoot = mkdtempSync(join(tmpdir(), "op-lazy-store-"));
  const workspaces = join(storeRoot, PREFIX, "workspaces");
  const store = new LocalWorkspaceStore(workspaces);
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = await store.createAgent({ workspaceId: ws.id, name: "Bob" });
  const agentDir = join(workspaces, ...agent.id.split("/"));
  writeFileSync(join(agentDir, "CLAUDE.md"), "# Bob\n");
  mkdirSync(join(agentDir, "reports"), { recursive: true });
  for (let i = 0; i < 40; i++) {
    writeFileSync(join(agentDir, "reports", `r${i}.csv`), `row,${i}\n`);
  }
  const runtime = join(agentDir, ".houston", "runtime");
  for (const id of ["c1", "c2"]) {
    mkdirSync(join(runtime, "conversations"), { recursive: true });
    mkdirSync(join(runtime, "sessions", id), { recursive: true });
    writeFileSync(
      join(runtime, "conversations", `${id}.json`),
      JSON.stringify({
        id,
        title: "old",
        createdAt: 1,
        updatedAt: 1,
        messages: [],
      }),
    );
    writeFileSync(join(runtime, "sessions", id, "s.jsonl"), "{}\n");
  }
  return { storeRoot, agentRel: `workspaces/${agent.id}` };
}

async function heartbeatOK(): Promise<string> {
  return listen(
    createServer((_req, res) => {
      res.writeHead(200);
      res.end("{}");
    }),
  );
}

async function postOp(base: string, heartbeatUrl: string, op: unknown) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${base}/op`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: "w1",
        agentId: "agent-1",
        gcsPrefix: PREFIX,
        hostToken: "host-token",
        claim: {
          id: "claim-1",
          bootId: "boot-1",
          token: "claim-token",
          heartbeatUrl,
        },
        triggersEnabled: false,
        op,
      }),
    });
    const json = (await response.json()) as Record<string, unknown>;
    if (response.status !== 503 || json.error !== "worker_full" || attempt > 40)
      return json;
    await new Promise((r) => setTimeout(r, 25));
  }
}

test("a Files listing downloads ZERO objects and still reports every file with its size", async () => {
  const { storeRoot } = await seedBusyAgent();
  const store = countingStore(storeRoot);
  const base = await listen(
    createTurnServer({ store, token: "", runTurn: noopTurn }),
  );
  const json = await postOp(base, await heartbeatOK(), {
    kind: "route",
    method: "GET",
    rest: "files",
    body: "",
    contentType: "application/json",
  });
  expect(json.status, JSON.stringify(json)).toBe(200);
  const listing = JSON.parse(json.body as string) as Array<{
    path: string;
    size: number;
    is_directory: boolean;
    date_modified?: number;
  }>;
  const files = listing.filter((e) => !e.is_directory);
  expect(files).toHaveLength(41);
  const r7 = files.find((e) => e.path === "reports/r7.csv");
  expect(r7?.size).toBe(Buffer.byteLength("row,7\n"));
  expect(r7?.date_modified).toBeGreaterThan(0);
  expect(listing.some((e) => e.is_directory && e.path === "reports")).toBe(
    true,
  );
  expect(store.downloads).toEqual([]);
});

test("a file download fetches exactly that object", async () => {
  const { storeRoot, agentRel } = await seedBusyAgent();
  const store = countingStore(storeRoot);
  const base = await listen(
    createTurnServer({ store, token: "", runTurn: noopTurn }),
  );
  const json = await postOp(base, await heartbeatOK(), {
    kind: "route",
    method: "GET",
    rest: "files/download",
    query: "path=reports/r3.csv",
  });
  expect(json.status, JSON.stringify(json)).toBe(200);
  expect(
    Buffer.from(json.bodyBase64 as string, "base64").toString("utf8"),
  ).toBe("row,3\n");
  expect(store.downloads).toEqual([`${agentRel}/reports/r3.csv`]);
});

test("deleting an unread file removes it from the store without downloading anything", async () => {
  const { storeRoot, agentRel } = await seedBusyAgent();
  const store = countingStore(storeRoot);
  const base = await listen(
    createTurnServer({ store, token: "", runTurn: noopTurn }),
  );
  const json = await postOp(base, await heartbeatOK(), {
    kind: "route",
    method: "DELETE",
    rest: "files",
    query: "path=reports/r5.csv",
  });
  expect(json.status, JSON.stringify(json)).toBe(200);
  expect(json.decline).toBeUndefined();
  expect(store.downloads).toEqual([]);
  const keys = await store.list(PREFIX);
  expect(keys).not.toContain(`${PREFIX}/${agentRel}/reports/r5.csv`);
  expect(keys).toContain(`${PREFIX}/${agentRel}/reports/r6.csv`);
  expect(keys).toHaveLength(41 + 4 - 1);
});

test("a routine create on a lazy tree writes the doc and leaves user files alone", async () => {
  const { storeRoot, agentRel } = await seedBusyAgent();
  const store = countingStore(storeRoot);
  const base = await listen(
    createTurnServer({ store, token: "", runTurn: noopTurn }),
  );
  const json = await postOp(base, await heartbeatOK(), {
    kind: "route",
    method: "POST",
    rest: "routines",
    contentType: "application/json",
    body: JSON.stringify({
      name: "Digest",
      prompt: "p",
      schedule: "0 9 * * *",
      enabled: true,
    }),
  });
  expect(json.status, JSON.stringify(json)).toBe(201);
  expect(json.events).toEqual(["RoutinesChanged"]);
  expect(
    store.downloads.every((k) => !k.startsWith(`${agentRel}/reports/`)),
  ).toBe(true);
  const keys = await store.list(PREFIX);
  expect(keys).toContain(
    `${PREFIX}/${agentRel}/.houston/routines/routines.json`,
  );
  expect(keys.filter((k) => k.includes("/reports/"))).toHaveLength(40);
});

test("a conversation rename hydrates its own conversation only", async () => {
  const { storeRoot, agentRel } = await seedBusyAgent();
  const store = countingStore(storeRoot);
  const base = await listen(
    createTurnServer({ store, token: "", runTurn: noopTurn }),
  );
  const json = await postOp(base, await heartbeatOK(), {
    kind: "conversation",
    action: "rename",
    conversationId: "c1",
    title: "new name",
  });
  expect(json.status, JSON.stringify(json)).toBe(200);
  expect(store.downloads).toEqual([
    `${agentRel}/.houston/runtime/conversations/c1.json`,
  ]);
  // Nothing but the renamed file changed in the store.
  const keys = await store.list(PREFIX);
  expect(keys).toContain(
    `${PREFIX}/${agentRel}/.houston/runtime/conversations/c2.json`,
  );
  expect(keys.filter((k) => k.includes("/reports/"))).toHaveLength(40);
  expect(keys).toHaveLength(45);
});

test("a folder move that hits the read cap mid-way declines and leaves the store untouched", async () => {
  const { storeRoot, agentRel } = await seedBusyAgent();
  // One oversized file among the forty: the per-child move refuses it.
  writeFileSync(
    join(storeRoot, PREFIX, agentRel, "reports", "huge.bin"),
    Buffer.alloc(MAX_UPLOAD_BYTES + 1),
  );
  const store = countingStore(storeRoot);
  const before = (await store.list(PREFIX)).sort();
  const base = await listen(
    createTurnServer({ store, token: "", runTurn: noopTurn }),
  );
  const json = await postOp(base, await heartbeatOK(), {
    kind: "route",
    method: "POST",
    rest: "files/move",
    contentType: "application/json",
    body: JSON.stringify({ path: "reports", toDir: "archive" }),
  });
  expect(json.decline, JSON.stringify(json)).toBe(true);
  expect(json.status).toBeUndefined();
  expect((await store.list(PREFIX)).sort()).toEqual(before);
  expect(store.downloads.some((k) => k.endsWith("/huge.bin"))).toBe(false);
});

test("a plain handler 5xx on a tree op declines before any sync-back", async () => {
  const { storeRoot } = await seedBusyAgent();
  const store = countingStore(storeRoot);
  const before = (await store.list(PREFIX)).sort();
  const base = await listen(
    createTurnServer({ store, token: "", runTurn: noopTurn }),
  );
  // A folder under a path the store holds as a FILE: a real tree fails the
  // mkdir (ENOTDIR) and the handler 500s; the worker must not sync or relay.
  const json = await postOp(base, await heartbeatOK(), {
    kind: "route",
    method: "POST",
    rest: "files/folder",
    contentType: "application/json",
    body: JSON.stringify({ path: "reports/r1.csv/sub" }),
  });
  expect(json.decline, JSON.stringify(json)).toBe(true);
  expect((await store.list(PREFIX)).sort()).toEqual(before);
});

test("a single file the store refuses answers 413, never a decline that lets the pod claim success", async () => {
  const { storeRoot } = await seedBusyAgent();
  const counting = countingStore(storeRoot);
  const store: typeof counting = {
    ...counting,
    upload: async (_src, key) => {
      throw new ObjectTooLargeError(key, "over the per-object cap");
    },
  };
  const base = await listen(
    createTurnServer({ store, token: "", runTurn: noopTurn }),
  );
  const json = await postOp(base, await heartbeatOK(), {
    kind: "route",
    method: "PUT",
    rest: "agentfile/notes.md",
    contentType: "application/json",
    body: JSON.stringify({ content: "# too big for the store" }),
  });
  expect(json.decline, JSON.stringify(json)).toBeUndefined();
  expect(json.status).toBe(413);
  expect(JSON.parse(json.body as string).files).toEqual([
    expect.stringMatching(/notes\.md$/),
  ]);
});

test("a conversation delete removes its file and unread session files, nothing else", async () => {
  const { storeRoot, agentRel } = await seedBusyAgent();
  const store = countingStore(storeRoot);
  const base = await listen(
    createTurnServer({ store, token: "", runTurn: noopTurn }),
  );
  const json = await postOp(base, await heartbeatOK(), {
    kind: "conversation",
    action: "delete",
    conversationId: "c1",
  });
  expect(json.status, JSON.stringify(json)).toBe(200);
  // A delete needs no bytes: existence comes from the listing.
  expect(store.downloads).toEqual([]);
  const keys = await store.list(PREFIX);
  const runtime = `${PREFIX}/${agentRel}/.houston/runtime`;
  expect(keys).not.toContain(`${runtime}/conversations/c1.json`);
  expect(keys).not.toContain(`${runtime}/sessions/c1/s.jsonl`);
  expect(keys).toContain(`${runtime}/conversations/c2.json`);
  expect(keys).toContain(`${runtime}/sessions/c2/s.jsonl`);
  expect(keys).toHaveLength(43);
});

test("renaming a conversation over the read cap declines to the pod instead of failing", async () => {
  const { storeRoot, agentRel } = await seedBusyAgent();
  writeFileSync(
    join(storeRoot, PREFIX, agentRel, ".houston/runtime/conversations/c1.json"),
    Buffer.alloc(MAX_UPLOAD_BYTES + 1),
  );
  const store = countingStore(storeRoot);
  const base = await listen(
    createTurnServer({ store, token: "", runTurn: noopTurn }),
  );
  const json = await postOp(base, await heartbeatOK(), {
    kind: "conversation",
    action: "rename",
    conversationId: "c1",
    title: "x",
  });
  expect(json.decline, JSON.stringify(json)).toBe(true);
  expect(store.downloads).toEqual([]);
});

test("renaming a conversation the agent does not have answers 404 without a download", async () => {
  const { storeRoot } = await seedBusyAgent();
  const store = countingStore(storeRoot);
  const base = await listen(
    createTurnServer({ store, token: "", runTurn: noopTurn }),
  );
  const json = await postOp(base, await heartbeatOK(), {
    kind: "conversation",
    action: "rename",
    conversationId: "ghost",
    title: "x",
  });
  expect(json.status, JSON.stringify(json)).toBe(404);
  expect(store.downloads).toEqual([]);
});
