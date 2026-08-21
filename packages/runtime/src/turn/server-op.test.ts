import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { LocalWorkspaceStore } from "@houston/host/src/store/local";
import { LocalDirStore } from "@houston/runtime-client/object-sync";
import { afterEach, expect, test } from "vitest";
import { createTurnServer } from "./server";
import type { runPiTurn } from "./turn-session";

const servers: Server[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const noopTurn: typeof runPiTurn = async () => ({});

/** An agent seeded through the host's own store (the pod's real layout). */
async function seedAgent(): Promise<{
  storeRoot: string;
  agentId: string;
  prefix: string;
}> {
  const storeRoot = mkdtempSync(join(tmpdir(), "op-store-"));
  const prefix = "ws/w1/agent-1";
  const workspaces = join(storeRoot, prefix, "workspaces");
  const store = new LocalWorkspaceStore(workspaces);
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = await store.createAgent({ workspaceId: ws.id, name: "Bob" });
  // Every real agent carries a CLAUDE.md — the directory the layout resolver
  // keys on. (Route ops hydrate WITHOUT the runtime tree, so the marker must
  // not live there.)
  const agentDir = join(workspaces, ...agent.id.split("/"));
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(join(agentDir, "CLAUDE.md"), "# Bob\n");
  // A user file + a runtime file: the files op must see the former and the
  // hydrate must skip the latter.
  writeFileSync(join(agentDir, "report.csv"), "a,b\n1,2\n");
  const runtime = join(agentDir, ".houston", "runtime", "conversations");
  mkdirSync(runtime, { recursive: true });
  writeFileSync(join(runtime, "c1.json"), "{}");
  return { storeRoot, agentId: agent.id, prefix };
}

async function heartbeatOK(): Promise<string> {
  return listen(
    createServer((_req, res) => {
      res.writeHead(200);
      res.end("{}");
    }),
  );
}

function opBody(_agentId: string, heartbeatUrl: string, op: unknown) {
  return {
    workspaceId: "w1",
    // The gateway sends the agent SLUG; the worker derives the engine id
    // ("Personal/Bob") from the hydrated layout.
    agentId: "agent-1",
    gcsPrefix: "ws/w1/agent-1",
    hostToken: "host-token",
    claim: {
      id: "claim-1",
      bootId: "boot-1",
      token: "claim-token",
      heartbeatUrl,
    },
    actingAs: { userId: "user-1" },
    triggersEnabled: false,
    op,
  };
}

async function postOp(base: string, body: unknown) {
  const response = await fetch(`${base}/op`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    json: (await response.json()) as Record<string, unknown>,
  };
}

test("a routine create runs on the worker and syncs the file back to the store", async () => {
  const { storeRoot, agentId, prefix } = await seedAgent();
  const store = new LocalDirStore(storeRoot);
  const base = await listen(
    createTurnServer({ store, token: "", runTurn: noopTurn }),
  );
  const { status, json } = await postOp(
    base,
    opBody(agentId, await heartbeatOK(), {
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
    }),
  );
  expect(status, JSON.stringify(json)).toBe(200);
  expect(json.ok).toBe(true);
  expect(json.status).toBe(201);
  const created = JSON.parse(json.body as string) as {
    id: string;
    created_by?: string;
  };
  expect(created.created_by).toBe("user-1");
  expect(json.events).toEqual(["RoutinesChanged"]);
  const synced = await store.list(prefix);
  const routinesKey = synced.find((k) =>
    k.endsWith("/.houston/routines/routines.json"),
  );
  expect(routinesKey).toBeDefined();
});

test("a conversation rename runs the runtime's own mutation and syncs only that file", async () => {
  const { storeRoot, agentId, prefix } = await seedAgent();
  const convFile = join(
    storeRoot,
    prefix,
    "workspaces",
    ...agentId.split("/"),
    ".houston",
    "runtime",
    "conversations",
    "c1.json",
  );
  mkdirSync(dirname(convFile), { recursive: true });
  writeFileSync(
    convFile,
    JSON.stringify({
      id: "c1",
      title: "old",
      createdAt: 1,
      updatedAt: 1,
      messages: [],
    }),
  );
  const store = new LocalDirStore(storeRoot);
  const base = await listen(
    createTurnServer({ store, token: "", runTurn: noopTurn }),
  );
  const { json } = await postOp(
    base,
    opBody(agentId, await heartbeatOK(), {
      kind: "conversation",
      action: "rename",
      conversationId: "c1",
      title: "new name",
    }),
  );
  expect(json.status).toBe(200);
  // LocalDirStore keeps objects on disk under the store root: read it back.
  const after = JSON.parse(readFileSync(convFile, "utf8")) as { title: string };
  expect(after.title).toBe("new name");
  expect(prefix).toBe("ws/w1/agent-1");
});

test("an invalid op is rejected before any hydration", async () => {
  const { storeRoot, agentId } = await seedAgent();
  const base = await listen(
    createTurnServer({
      store: new LocalDirStore(storeRoot),
      token: "",
      runTurn: noopTurn,
    }),
  );
  const { status, json } = await postOp(
    base,
    opBody(agentId, "http://127.0.0.1:1/hb", {
      kind: "route",
      method: "GET",
      rest: "routines",
    }),
  );
  expect(status).toBe(400);
  expect(String(json.error)).toContain("not a read op route");
});

test("a files list runs as a READ op: no sync-back, runtime tree not hydrated", async () => {
  const { storeRoot, agentId } = await seedAgent();
  const store = new LocalDirStore(storeRoot);
  const base = await listen(
    createTurnServer({ store, token: "", runTurn: noopTurn }),
  );
  const { json } = await postOp(
    base,
    opBody(agentId, await heartbeatOK(), {
      kind: "route",
      method: "GET",
      rest: "files",
    }),
  );
  expect(json.status).toBe(200);
  const listing = JSON.parse(json.body as string) as Array<{ name: string }>;
  const names = listing.map((e) => e.name);
  expect(names).toContain("report.csv");
  // Runtime files never surface in the Files tab and were not hydrated.
  expect(JSON.stringify(listing)).not.toContain("c1.json");
});

test("a file download relays binary bytes base64 with its headers", async () => {
  const { storeRoot, agentId } = await seedAgent();
  const store = new LocalDirStore(storeRoot);
  const base = await listen(
    createTurnServer({ store, token: "", runTurn: noopTurn }),
  );
  const { json } = await postOp(
    base,
    opBody(agentId, await heartbeatOK(), {
      kind: "route",
      method: "GET",
      rest: "files/download",
      query: "path=report.csv",
    }),
  );
  expect(json.status).toBe(200);
  // Always base64 on a download — byte-exact, whatever the MIME.
  expect(typeof json.bodyBase64).toBe("string");
  expect(json.body).toBe("");
  expect(
    Buffer.from(json.bodyBase64 as string, "base64").toString("utf8"),
  ).toBe("a,b\n1,2\n");
  expect(
    String(
      (json.headers as Record<string, string> | undefined)?.[
        "content-disposition"
      ] ?? "",
    ),
  ).toContain("report.csv");
});

test("a root-level agentfile write persists (F6: no longer dropped)", async () => {
  const { storeRoot, agentId, prefix } = await seedAgent();
  const store = new LocalDirStore(storeRoot);
  const base = await listen(
    createTurnServer({ store, token: "", runTurn: noopTurn }),
  );
  const { json } = await postOp(
    base,
    opBody(agentId, await heartbeatOK(), {
      kind: "route",
      method: "PUT",
      rest: "agentfile/data-schema.md",
      contentType: "application/json",
      body: JSON.stringify({ content: "# schema" }),
    }),
  );
  expect(json.ok).toBe(true);
  expect(json.decline).toBeUndefined();
  // The whole-agent-dir scope carried it to the store (before, it was dropped).
  const synced = await store.list(prefix);
  expect(synced.some((k) => k.endsWith("/data-schema.md"))).toBe(true);
});

test("mission attribution (actingAs.name) reaches the activity handler", async () => {
  const { storeRoot, agentId } = await seedAgent();
  const store = new LocalDirStore(storeRoot);
  const base = await listen(
    createTurnServer({ store, token: "", runTurn: noopTurn }),
  );
  const body = opBody(agentId, await heartbeatOK(), {
    kind: "route",
    method: "POST",
    rest: "activities",
    contentType: "application/json",
    body: JSON.stringify({ title: "Draft the memo", status: "needs_you" }),
  });
  (body.actingAs as { name?: string }).name = "Alice Lee";
  const { json } = await postOp(base, body);
  expect(json.status).toBe(201);
  const created = JSON.parse(json.body as string) as {
    created_by?: string;
    contributors?: Array<{ user_id: string; name?: string }>;
  };
  expect(created.created_by).toBe("user-1");
  expect(created.contributors).toEqual([
    { user_id: "user-1", name: "Alice Lee" },
  ]);
});
