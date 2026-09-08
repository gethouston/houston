import type { IncomingMessage, ServerResponse } from "node:http";
import { docKey, saveActivities } from "@houston/domain";
import type { Activity, HoustonEvent } from "@houston/protocol";
import { beforeEach, expect, test } from "vitest";
import type { Agent, Workspace } from "../domain/types";
import { LocalPaths } from "../paths";
import type { RuntimeChannel, TurnPin } from "../ports";
import type { ControlPlaneDeps } from "../server";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";
import type { AgentRouteDeps } from "./agent-authz";
import { handleAgentMissions } from "./missions-remote-inbound";
import type { MissionsDeps } from "./missions-sandbox";

/**
 * The pod side of a cross-pod mission: `/agents/{id}/missions…` served for the
 * agent in the path. It is the SAME start a local caller runs — the cap, the
 * row, the event and the first turn — with the provenance the caller could not
 * write itself: the agent-started marker, and a depth this side enforces
 * because the parent chat lives in a pod this one cannot read.
 */

const paths = new LocalPaths();

let store: MemoryWorkspaceStore;
let vfs: MemoryVfs;
let ws: Workspace;
let agent: Agent;
let root: string;
let events: HoustonEvent[];
let fired: { agentId: string; cid: string; text: string; pin?: TurnPin }[];

const channel = {
  async fireTurn(
    ctx: { agent: Agent },
    cid: string,
    text: string,
    pin?: TurnPin,
  ): Promise<void> {
    fired.push({ agentId: ctx.agent.id, cid, text, pin });
  },
} as unknown as RuntimeChannel;

function fakeReq(body: unknown): IncomingMessage {
  const buf =
    body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body));
  return {
    headers: {},
    async *[Symbol.asyncIterator]() {
      if (buf.byteLength) yield buf;
    },
  } as unknown as IncomingMessage;
}

function fakeRes() {
  const captured: { status: number; body: unknown } = { status: 0, body: null };
  const res = {
    writeHead(status: number) {
      captured.status = status;
      return res;
    },
    end(chunk?: Buffer) {
      captured.body = chunk ? JSON.parse(chunk.toString("utf8")) : null;
    },
  } as unknown as ServerResponse;
  return { res, captured };
}

async function call(method: string, rest: string, body?: unknown) {
  const deps = {
    store,
    vfs,
    paths,
    channels: { local: channel },
    gatewayFronted: true,
    events: {
      emit: (_userId: string, event: HoustonEvent) => events.push(event),
    },
  } as unknown as MissionsDeps;
  const { res, captured } = fakeRes();
  const url = new URL(`http://pod/agents/${agent.id}/${rest}`);
  const handled = await handleAgentMissions(
    deps,
    {
      workspace: ws,
      agent,
      author: { user_id: "u-1", name: "alice" },
    },
    method,
    url.pathname.split("/").slice(3).join("/"),
    url,
    fakeReq(body),
    res,
  );
  return { handled, ...captured };
}

async function board(): Promise<Activity[]> {
  return JSON.parse(
    (await vfs.readText(docKey(root, "activity"))) ?? "[]",
  ) as Activity[];
}

const ORIGIN = { session_key: "conv-parent", agent: "agent-caller", depth: 1 };

beforeEach(async () => {
  store = new MemoryWorkspaceStore({ defaultRuntime: "local" });
  vfs = new MemoryVfs();
  events = [];
  fired = [];
  ws = await store.getOrCreatePersonalWorkspace("alice");
  agent = await store.createAgent({ workspaceId: ws.id, name: "Dobby" });
  root = paths.agentRoot(ws, agent);
});

test("a start from another pod lands on this agent's board and fires its turn", async () => {
  const r = await call("POST", "missions/start", {
    title: "Roast the website",
    prompt: "Roast it.",
    mode: "auto",
    origin: ORIGIN,
  });
  expect(r.status).toBe(201);
  const created = (await board())[0];
  expect(created?.title).toBe("Roast the website");
  expect(created?.status).toBe("running");
  // The marker the caller could not write itself: what makes the runtime's
  // turn-end report settle this card (missions-manage.ts).
  expect(created?.origin_session_key).toBe("conv-parent");
  // Attribution comes from the gateway-verified acting identity, not the body.
  expect(created?.created_by).toBe("u-1");
  expect(fired).toEqual([
    {
      agentId: agent.id,
      cid: `activity-${created?.id}`,
      text: "Roast it.",
      pin: { mode: "auto" },
    },
  ]);
  expect(events).toContainEqual({
    type: "ActivityChanged",
    agentPath: agent.id,
  });
});

test("provenance is required, and a deeper origin is refused", async () => {
  const naked = await call("POST", "missions/start", {
    title: "t",
    prompt: "p",
  });
  expect(naked.status).toBe(400);
  expect((naked.body as { code: string }).code).toBe("invalid_origin");

  const deep = await call("POST", "missions/start", {
    title: "t",
    prompt: "p",
    origin: { ...ORIGIN, depth: 2 },
  });
  expect(deep.status).toBe(409);
  expect((deep.body as { code: string }).code).toBe("mission_depth");
  expect(await board()).toEqual([]);
  expect(fired).toEqual([]);
});

test("this route serves the agent it addresses, never a second hop", async () => {
  const r = await call("POST", "missions/start", {
    agent: "Someone Else",
    title: "t",
    prompt: "p",
    origin: ORIGIN,
  });
  expect(r.status).toBe(400);
  expect((r.body as { code: string }).code).toBe("invalid_agent");
  expect(await board()).toEqual([]);
});

test("the board and one transcript read back for the caller", async () => {
  await saveActivities(vfs, root, [
    {
      id: "m-1",
      title: "Roast the website",
      description: "",
      status: "needs_you",
      origin_session_key: "conv-parent",
    },
  ]);
  const listed = await call("GET", "missions");
  expect(listed.status).toBe(200);
  expect((listed.body as { missions: { id: string }[] }).missions).toEqual([
    expect.objectContaining({ id: "m-1", agent_started: true }),
  ]);

  const read = await call("GET", "missions/read");
  expect(read.status).toBe(400);
});

test("a move from another pod lands on this agent's board", async () => {
  await saveActivities(vfs, root, [
    {
      id: "m-1",
      title: "Roast the website",
      description: "",
      status: "needs_you",
      origin_session_key: "conv-parent",
    },
  ]);
  const r = await call("POST", "missions/status", {
    id: "m-1",
    status: "done",
  });
  expect(r.status).toBe(200);
  expect((await board())[0]?.status).toBe("done");
});

test("a move that names a different agent is refused: this route serves its own", async () => {
  const r = await call("POST", "missions/status", {
    agent: "Someone Else",
    id: "m-1",
    status: "done",
  });
  expect(r.status).toBe(400);
  expect((r.body as { code: string }).code).toBe("invalid_agent");
});

test("the family owns its whole subtree; other paths fall through", async () => {
  const wrongVerb = await call("POST", "missions");
  expect(wrongVerb.handled).toBe(true);
  expect(wrongVerb.status).toBe(405);

  // Never a fall-through to the agent's runtime, which has no mission routes.
  const unknown = await call("GET", "missions/nope");
  expect(unknown.handled).toBe(true);
  expect(unknown.status).toBe(404);

  const other = await call("GET", "conversations");
  expect(other.handled).toBe(false);
});

test("the server's own deps satisfy this route, so the mount passes them through", () => {
  // Compile-time guard on the seam: routes/agents.ts hands its own `deps` bag
  // straight in (agents.ts, the /agents/:id/... dispatch), and server.ts hands
  // that route the control plane's.
  const mountable = (deps: AgentRouteDeps): MissionsDeps => deps;
  const served = (deps: ControlPlaneDeps): AgentRouteDeps => deps;
  expect([typeof mountable, typeof served]).toEqual(["function", "function"]);
});
