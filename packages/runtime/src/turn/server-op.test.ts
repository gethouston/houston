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
  // The standing layout marker the turn layout resolver keys on.
  const settings = join(
    workspaces,
    ...agent.id.split("/"),
    ".houston",
    "runtime",
    "settings.json",
  );
  mkdirSync(dirname(settings), { recursive: true });
  writeFileSync(settings, "{}");
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

function opBody(agentId: string, heartbeatUrl: string, op: unknown) {
  return {
    workspaceId: "w1",
    agentId,
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
  expect(String(json.error)).toContain("write method");
});
