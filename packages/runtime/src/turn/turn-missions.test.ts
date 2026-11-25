import { mkdir, mkdtemp } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createActivity, saveActivities } from "@houston/domain";
import { liveTurns } from "@houston/host/src/routes/live-turn";
import { FsVfs } from "@houston/host/src/vfs";
import { afterEach, expect, test } from "vitest";
import type { TurnFilesystem } from "./turn-filesystem";
import { startTurnMissions, type TurnMissionsSession } from "./turn-missions";
import type { TurnRequest } from "./types";

const HOST_TOKEN = "turn-v1.payload.sig";
const ACTING = "acting-v1.payload.sig";
const SLUG = "a551abc";
const AGENT_ID = "Personal/Agent";
const WORKSPACE_REL = `workspaces/${AGENT_ID}`;

const servers: Server[] = [];
const sessions: TurnMissionsSession[] = [];
afterEach(async () => {
  await Promise.all(sessions.splice(0).map((s) => s.dispose()));
  await Promise.all(
    servers.splice(0).map((s) => new Promise((r) => s.close(r))),
  );
});

interface Seen {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body?: string;
}

type Answer = { status: number; body: unknown };

async function fakeGateway(answers: Record<string, Answer> = {}) {
  const seen: Seen[] = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += String(chunk);
    seen.push({
      method: req.method ?? "",
      url: req.url ?? "",
      headers: req.headers,
      ...(body ? { body } : {}),
    });
    const answer = answers[`${req.method} ${req.url}`] ?? {
      status: 404,
      body: { error: "not found" },
    };
    res.statusCode = answer.status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(answer.body));
  });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, seen };
}

async function hydrated(board: ReturnType<typeof createActivity>[] = []) {
  const storeRoot = await mkdtemp(join(tmpdir(), "turn-missions-"));
  await mkdir(join(storeRoot, WORKSPACE_REL), { recursive: true });
  const vfs = new FsVfs(storeRoot);
  if (board.length) await saveActivities(vfs, WORKSPACE_REL, board);
  return {
    kind: "standing",
    storeRoot,
    workspaceRel: WORKSPACE_REL,
    dataRel: `${WORKSPACE_REL}/.houston/runtime`,
    vfs,
    manifest: new Map(),
    immediateWrites: new Set<string>(),
  } as unknown as TurnFilesystem;
}

function turn(extra: Partial<TurnRequest> = {}): TurnRequest {
  return {
    workspaceId: "w1",
    agentId: "a1",
    conversationId: "c-parent",
    text: "split this up",
    nonce: "n1",
    gcsPrefix: `ws/acme/${SLUG}`,
    credential: null,
    mode: "execute",
    actingAs: { userId: "user-1" },
    actingToken: ACTING,
    liveMode: { current: "execute" },
    ...extra,
  } as TurnRequest;
}

async function session(opts: {
  gateway: string;
  filesystem?: TurnFilesystem;
  turn?: TurnRequest;
  actingToken?: string;
  hydrated?: Promise<unknown>;
}) {
  const started = startTurnMissions({
    turn: opts.turn ?? turn(),
    actingToken: opts.actingToken ?? ACTING,
    gateway: { url: opts.gateway, token: HOST_TOKEN },
    agentSlug: SLUG,
    filesystem: opts.filesystem ?? (await hydrated()),
    hydrated: opts.hydrated ?? Promise.resolve(),
  });
  sessions.push(started);
  return started;
}

function call(
  s: TurnMissionsSession,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
) {
  const res = s.route(path, {
    method,
    headers: {
      "content-type": "application/json",
      "x-houston-conversation-id": "c-parent",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res) throw new Error(`${method} ${path} is not mounted`);
  return res;
}

const card = (id: string, extra: Record<string, unknown> = {}) => ({
  ...createActivity(
    { title: `Mission ${id}`, description: "do it" },
    id,
    "2026-11-01T00:00:00.000Z",
  ),
  ...extra,
});

test("a start on the turn's own board goes to the gateway with the turn's credentials", async () => {
  const gateway = await fakeGateway({
    [`POST /agents/${SLUG}/missions/start`]: {
      status: 201,
      body: { id: "m-new", title: "Research", status: "running" },
    },
  });
  const s = await session({ gateway: gateway.url });
  const res = await call(s, "POST", "/sandbox/missions/start", {
    title: "Research",
    prompt: "Find three suppliers",
  });
  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({
    id: "m-new",
    title: "Research",
    status: "running",
  });
  expect(gateway.seen).toHaveLength(1);
  const [start] = gateway.seen;
  expect(start?.method).toBe("POST");
  expect(start?.url).toBe(`/agents/${SLUG}/missions/start`);
  expect(start?.headers.authorization).toBe(`Bearer ${HOST_TOKEN}`);
  expect(start?.headers["x-houston-acting-as"]).toBe(ACTING);
  expect(start?.headers["content-type"]).toBe("application/json");
  expect(JSON.parse(start?.body ?? "")).toEqual({
    title: "Research",
    prompt: "Find three suppliers",
    origin: { session_key: "c-parent", agent: AGENT_ID, depth: 1 },
  });
});

test("a chat that is itself an agent-started mission cannot start another", async () => {
  const gateway = await fakeGateway();
  const filesystem = await hydrated([
    card("m-parent", { session_key: "c-parent", origin_session_key: "c-up" }),
  ]);
  const s = await session({ gateway: gateway.url, filesystem });
  expect(await s.guidance).toBe("nested");
  const res = await call(s, "POST", "/sandbox/missions/start", {
    title: "More",
    prompt: "Go deeper",
  });
  expect(res.status).toBe(409);
  expect(((await res.json()) as { code: string }).code).toBe("mission_depth");
  expect(gateway.seen).toHaveLength(0);
});

test("the nested check waits for the board to hydrate", async () => {
  const gateway = await fakeGateway();
  const filesystem = await hydrated();
  let landed: () => void = () => undefined;
  const board = new Promise<void>((resolve) => {
    landed = resolve;
  });
  const s = await session({
    gateway: gateway.url,
    filesystem,
    hydrated: board,
  });
  await saveActivities(filesystem.vfs, WORKSPACE_REL, [
    card("m-parent", { session_key: "c-parent", origin_session_key: "c-up" }),
  ]);
  landed();
  expect(await s.guidance).toBe("nested");
});

test("a delegated turn reads as nested and its start is refused before the gateway", async () => {
  const gateway = await fakeGateway();
  const payload = Buffer.from(
    JSON.stringify({ sub: "user-1", agent: SLUG, dlg: "other-agent" }),
  ).toString("base64url");
  const delegated = `acting-v1.${payload}.sig`;
  const s = await session({
    gateway: gateway.url,
    actingToken: delegated,
    turn: turn({ actingToken: delegated }),
  });
  expect(await s.guidance).toBe("nested");
  const res = await call(s, "POST", "/sandbox/missions/start", {
    title: "More",
    prompt: "Go deeper",
  });
  expect(res.status).toBe(409);
  expect(((await res.json()) as { code: string }).code).toBe("mission_depth");
  expect(gateway.seen).toHaveLength(0);
});

test("an ordinary chat offers the whole family", async () => {
  const gateway = await fakeGateway();
  const s = await session({ gateway: gateway.url });
  expect(await s.guidance).toBe("full");
});

test("Teamwork off reaches the model as the gateway's own refusal", async () => {
  const gateway = await fakeGateway({
    "GET /agents": {
      status: 403,
      body: {
        code: "delegation_off",
        error: "delegation is disabled for the calling agent",
      },
    },
  });
  const s = await session({ gateway: gateway.url });
  const res = await call(s, "GET", "/sandbox/missions/agents");
  expect(res.status).toBe(403);
  expect(((await res.json()) as { code: string }).code).toBe("delegation_off");
  expect(gateway.seen[0]?.headers.authorization).toBe(`Bearer ${HOST_TOKEN}`);
  expect(gateway.seen[0]?.headers["x-houston-acting-as"]).toBe(ACTING);
});

test("the directory lists the gateway's other agents", async () => {
  const gateway = await fakeGateway({
    "GET /agents": {
      status: 200,
      body: [{ id: "agent-dobby", name: "Dobby", workspaceId: "ws-1" }],
    },
  });
  const s = await session({ gateway: gateway.url });
  const res = await call(s, "GET", "/sandbox/missions/agents");
  expect(res.status).toBe(200);
  const { agents } = (await res.json()) as { agents: { id: string }[] };
  expect(agents.map((a) => a.id)).toEqual(["agent-dobby"]);
});

test("the board is the hydrated one, and an own mission's transcript is the gateway's", async () => {
  const gateway = await fakeGateway({
    [`GET /agents/${SLUG}/missions/read?id=m1&limit=5`]: {
      status: 200,
      body: {
        id: "m1",
        status: "needs_you",
        title: "Mission m1",
        totalMessages: 1,
        messages: [{ role: "assistant", content: "done" }],
      },
    },
  });
  const filesystem = await hydrated([
    card("m1", { status: "needs_you", origin_session_key: "c-parent" }),
    card("m-parent", { session_key: "c-parent" }),
  ]);
  const s = await session({ gateway: gateway.url, filesystem });
  const list = await call(s, "GET", "/sandbox/missions");
  const { missions } = (await list.json()) as {
    missions: { id: string; this_conversation?: boolean }[];
  };
  expect(missions.find((m) => m.id === "m-parent")?.this_conversation).toBe(
    true,
  );
  expect(missions.find((m) => m.id === "m1")).toBeDefined();
  expect(gateway.seen).toHaveLength(0);

  const read = await call(s, "GET", "/sandbox/missions/read?id=m1&limit=5");
  expect(read.status).toBe(200);
  expect(((await read.json()) as { totalMessages: number }).totalMessages).toBe(
    1,
  );
  expect(gateway.seen[0]?.url).toBe(
    `/agents/${SLUG}/missions/read?id=m1&limit=5`,
  );
});

test("a move lands on the hydrated board, and plan mode is read at call time", async () => {
  const gateway = await fakeGateway();
  const filesystem = await hydrated([card("m1", { status: "needs_you" })]);
  const live = turn();
  const s = await session({ gateway: gateway.url, filesystem, turn: live });
  if (live.liveMode) live.liveMode.current = "plan";
  const refused = await call(s, "POST", "/sandbox/missions/status", {
    id: "m1",
    status: "done",
  });
  expect(refused.status).toBe(403);
  expect(((await refused.json()) as { code: string }).code).toBe("plan_mode");
  if (live.liveMode) live.liveMode.current = "execute";
  const moved = await call(s, "POST", "/sandbox/missions/status", {
    id: "m1",
    status: "done",
  });
  expect(moved.status).toBe(200);
  expect(gateway.seen).toHaveLength(0);
});

test("only the agent's mission tools are mounted, and dispose ends the live turn", async () => {
  const gateway = await fakeGateway();
  const s = await session({ gateway: gateway.url });
  expect(s.route("/sandbox/missions/settle", { method: "POST" })).toBeNull();
  expect(s.route("/sandbox/missions/title", { method: "POST" })).toBeNull();
  expect(s.route("/sandbox/missions/start", { method: "GET" })).toBeNull();
  expect(s.route("/sandbox/routines/save", { method: "POST" })).toBeNull();
  expect(liveTurns.get(AGENT_ID, "c-parent")?.actingAs).toBe(ACTING);
  await s.dispose();
  sessions.splice(sessions.indexOf(s), 1);
  expect(liveTurns.get(AGENT_ID, "c-parent")).toBeUndefined();
});
