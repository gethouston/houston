import { mkdir, mkdtemp } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsVfs } from "@houston/host/src/vfs";
import type { WireFrame } from "@houston/runtime-client";
import { afterEach, expect, test } from "vitest";
import { bucket } from "./turn-approvals.test-support";
import { startTurnCoordinator } from "./turn-coordinator";
import type { TurnFilesystem } from "./turn-filesystem";
import type { TurnRequest } from "./types";

/**
 * A pooled Houston turn end to end, against a fake gateway: operations leave
 * with the turn's own credential, and an approval card raised in one
 * sandbox is answered and spent in the next, exactly once.
 */

const TOKEN = "assistant-turn-v1.payload.sig";
const ACTING = "acting-v1.payload.sig";
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((s) => new Promise((r) => s.close(r))),
  );
});

interface Seen {
  method: string;
  url: string;
  auth: string | undefined;
  body?: string;
}

async function fakeGateway() {
  const seen: Seen[] = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += String(chunk);
    seen.push({
      method: req.method ?? "",
      url: req.url ?? "",
      auth: req.headers.authorization,
      ...(body ? { body } : {}),
    });
    res.setHeader("content-type", "application/json");
    if (req.method === "GET" && req.url === "/agents") {
      res.end(
        JSON.stringify([
          { id: "agent-dobby", name: "Dobby", workspaceId: "ws-1" },
        ]),
      );
      return;
    }
    if (req.method === "GET" && req.url === "/agents/agent-dobby/missions") {
      res.end(JSON.stringify({ items: [] }));
      return;
    }
    if (
      req.method === "POST" &&
      req.url === "/agents/agent-dobby/missions/start"
    ) {
      res.end(JSON.stringify({ id: "m1" }));
      return;
    }
    if (req.method === "DELETE" && req.url === "/agents/agent-dobby") {
      // The gateway's delete answers 204 with no body.
      res.statusCode = 204;
      res.removeHeader("content-type");
      res.end();
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not found" }));
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, seen };
}

/** One single-use sandbox: a fresh root over the shared store. */
async function sandbox() {
  const storeRoot = await mkdtemp(join(tmpdir(), "coordinator-turn-"));
  const workspaceRel = "workspaces/Personal/Assistant";
  await mkdir(join(storeRoot, workspaceRel), { recursive: true });
  return {
    storeRoot,
    workspaceRel,
    dataRel: `${workspaceRel}/.houston/runtime`,
    vfs: new FsVfs(storeRoot),
    manifest: new Map(),
    immediateWrites: new Set<string>(),
  } as unknown as TurnFilesystem;
}

function turn(extra: Partial<TurnRequest> = {}): TurnRequest {
  return {
    workspaceId: "w1",
    agentId: "a1",
    conversationId: "assistant",
    text: "delete Dobby",
    nonce: "n1",
    gcsPrefix: "ws/acme/a551abc",
    credential: null,
    mode: "execute",
    actingAs: { userId: "owner-1" },
    actingToken: ACTING,
    coordinator: { token: TOKEN, expires: 4102444800 },
    ...extra,
  };
}

async function session(
  store: ReturnType<typeof bucket>["store"],
  gatewayUrl: string,
  extra: Partial<TurnRequest> = {},
) {
  return startTurnCoordinator({
    turn: turn(extra),
    ownerId: "owner-1",
    token: TOKEN,
    gatewayUrl,
    agentSlug: "a551abc",
    store,
    prefix: "ws/acme/a551abc",
    filesystem: await sandbox(),
  });
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-houston-conversation-id": "assistant",
    "x-houston-acting-as": ACTING,
  },
  body: JSON.stringify(body),
});

test("an operation leaves with the turn's own Houston credential", async () => {
  const gateway = await fakeGateway();
  const { store } = bucket();
  const houston = await session(store, gateway.url);
  const res = await houston.route(
    "/sandbox/assistant/call",
    post({ operation: "listAgents", params: {} }),
  );
  expect(res?.status).toBe(200);
  expect(gateway.seen).toContainEqual({
    method: "GET",
    url: "/agents",
    auth: `Bearer ${TOKEN}`,
  });
  await houston.dispose();
});

test("a card raised in one turn is answered and spent in the next, once", async () => {
  const gateway = await fakeGateway();
  const { store } = bucket();
  const call = { operation: "deleteAgent", params: { id: "Dobby" } };

  const first = await session(store, gateway.url);
  const pending = await first.route("/sandbox/assistant/pending", post(call));
  const card = (await pending?.json()) as { requestId: string };
  expect(card.requestId).toBeTruthy();
  const early = await first.route("/sandbox/assistant/call", post(call));
  expect(early?.status).not.toBe(200);
  await first.dispose();
  expect(gateway.seen.some((r) => r.method === "DELETE")).toBe(false);

  const answered = await session(store, gateway.url, {
    nonce: "n2",
    text: "yes",
    approvals: [{ requestId: card.requestId, decision: "approve" }],
  });
  const done = await answered.route(
    "/sandbox/assistant/call",
    post({ ...call, requestId: card.requestId }),
  );
  expect(done?.status).toBe(204);
  expect(gateway.seen).toContainEqual({
    method: "DELETE",
    url: "/agents/agent-dobby",
    auth: `Bearer ${TOKEN}`,
  });
  await answered.dispose();

  const replay = await session(store, gateway.url, { nonce: "n3" });
  const again = await replay.route(
    "/sandbox/assistant/call",
    post({ ...call, requestId: card.requestId }),
  );
  expect(again?.status).not.toBe(200);
  expect(gateway.seen.filter((r) => r.method === "DELETE")).toHaveLength(1);
  await replay.dispose();
});

test("the model cannot approve its own card by replaying its message", async () => {
  const gateway = await fakeGateway();
  const { store } = bucket();
  const call = { operation: "deleteAgent", params: { id: "Dobby" } };
  const first = await session(store, gateway.url);
  const pending = await first.route("/sandbox/assistant/pending", post(call));
  const card = (await pending?.json()) as { requestId: string };
  await first.dispose();
  // A next turn whose message carries no answer retires the card.
  const unanswered = await session(store, gateway.url, { nonce: "n2" });
  const res = await unanswered.route(
    "/sandbox/assistant/call",
    post({ ...call, requestId: card.requestId }),
  );
  expect(res?.status).not.toBe(200);
  expect(gateway.seen.some((r) => r.method === "DELETE")).toBe(false);
  await unanswered.dispose();
});

test("mission reads go to the named agent through the gateway", async () => {
  const gateway = await fakeGateway();
  const { store } = bucket();
  const houston = await session(store, gateway.url);
  const res = await houston.route("/sandbox/missions?agent=Dobby", {
    method: "GET",
    headers: { "x-houston-conversation-id": "assistant" },
  });
  expect(res?.status).toBe(200);
  expect(gateway.seen).toContainEqual({
    method: "GET",
    url: "/agents/agent-dobby/missions",
    auth: `Bearer ${TOKEN}`,
  });
  await houston.dispose();
});

test("other sandbox paths are not Houston's to answer", async () => {
  const gateway = await fakeGateway();
  const houston = await session(bucket().store, gateway.url);
  expect(houston.route("/sandbox/integrations/search", post({}))).toBeNull();
  await houston.dispose();
});

test("an approval card leaves the turn rendered from its record", async () => {
  const gateway = await fakeGateway();
  const { store } = bucket();
  const houston = await session(store, gateway.url);
  const pending = await houston.route(
    "/sandbox/assistant/pending",
    post({ operation: "deleteAgent", params: { id: "Dobby" } }),
  );
  const card = (await pending?.json()) as { requestId: string };
  const done = {
    type: "done",
    data: null,
    pendingInteraction: {
      steps: [
        {
          kind: "question",
          id: "q1",
          requestId: card.requestId,
          question: "model words",
          options: [],
        },
        {
          kind: "question",
          id: "q2",
          requestId: "forged",
          approval: { operation: "deleteAgent", args: [] },
          question: "forged",
        },
      ],
    },
  } as unknown as WireFrame;
  const shown = JSON.stringify(houston.present(done));
  expect(shown).toContain('"approval":{"operation":"deleteAgent"');
  expect(shown).not.toContain("model words");
  expect(shown).not.toContain('"requestId":"forged"');
  await houston.dispose();
});

test("a message reusing a nonce for other words refuses the turn and every route", async () => {
  const gateway = await fakeGateway();
  const { store } = bucket();
  const first = await session(store, gateway.url);
  expect(await first.admission()).toBeNull();
  await first.dispose();
  const reused = await session(store, gateway.url, { text: "something else" });
  expect(await reused.admission()).toBe("nonce_conflict");
  const call = await reused.route(
    "/sandbox/assistant/call",
    post({ operation: "listAgents", params: {} }),
  );
  const missions = await reused.route("/sandbox/missions?agent=Dobby", {
    method: "GET",
    headers: { "x-houston-conversation-id": "assistant" },
  });
  expect(call?.status).toBe(503);
  expect(missions?.status).toBe(503);
  expect(gateway.seen.some((r) => r.url.includes("/missions"))).toBe(false);
  await reused.dispose();
});

test("a spent approval is durable before the operation leaves", async () => {
  const gateway = await fakeGateway();
  const store = bucket();
  const call = { operation: "deleteAgent", params: { id: "Dobby" } };
  const first = await session(store.store, gateway.url);
  const pending = await first.route("/sandbox/assistant/pending", post(call));
  const card = (await pending?.json()) as { requestId: string };
  await first.dispose();
  const answered = await session(store.store, gateway.url, {
    nonce: "n2",
    approvals: [{ requestId: card.requestId, decision: "approve" }],
  });
  expect(await answered.admission()).toBeNull();
  store.failWrites();
  const res = await answered.route(
    "/sandbox/assistant/call",
    post({ ...call, requestId: card.requestId }),
  );
  expect(res?.status).not.toBe(200);
  expect(gateway.seen.some((r) => r.method === "DELETE")).toBe(false);
  await answered.dispose();
});

test("a pinned provider travels to the agent that judges it", async () => {
  const gateway = await fakeGateway();
  const houston = await session(bucket().store, gateway.url);
  const res = await houston.route(
    "/sandbox/missions/start",
    post({
      agent: "Dobby",
      title: "Research",
      prompt: "Look",
      provider: "openai-codex",
    }),
  );
  expect(res?.status).toBe(200);
  const start = gateway.seen.find(
    (r) => r.url === "/agents/agent-dobby/missions/start",
  );
  expect(start?.auth).toBe(`Bearer ${TOKEN}`);
  expect(JSON.parse(start?.body ?? "{}").provider).toBe("openai-codex");
  await houston.dispose();
});

test("the plan gate follows a mode switch made after the turn began", async () => {
  const gateway = await fakeGateway();
  const liveMode = { current: "execute" as "execute" | "plan" | "auto" };
  const houston = await session(bucket().store, gateway.url, {
    mode: undefined,
    liveMode,
  });
  const start = () =>
    houston.route(
      "/sandbox/missions/start",
      post({ agent: "Dobby", title: "Research", prompt: "Look" }),
    );
  liveMode.current = "plan";
  const planned = await start();
  expect(planned?.status).toBe(403);
  expect(((await planned?.json()) as { code: string }).code).toBe("plan_mode");
  liveMode.current = "execute";
  expect((await start())?.status).toBe(200);
  expect(
    gateway.seen.filter((r) => r.url === "/agents/agent-dobby/missions/start"),
  ).toHaveLength(1);
  await houston.dispose();
});
