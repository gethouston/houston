import type { IncomingMessage, ServerResponse } from "node:http";
import {
  docKey,
  loadConfig,
  saveActivities,
  saveConfig,
} from "@houston/domain";
import type { Activity, HoustonEvent, TurnLimits } from "@houston/protocol";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ACTING_AS_HEADER } from "../auth/acting";
import { assistantCallHeaders } from "../auth/assistant-call";
import type { Agent, Workspace } from "../domain/types";
import type { FireTurnOptions } from "../fire-turn-options";
import { conversationKey, LocalPaths } from "../paths";
import type { RuntimeChannel, TurnPin } from "../ports";
import type { ControlPlaneDeps } from "../server";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";
import type { AgentRouteDeps } from "./agent-authz";
import {
  CALLING_AGENT_HEADER,
  trustedCallingAgent,
} from "./missions-calling-agent";
import type { MissionOrigin } from "./missions-remote";
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
let fired: {
  agentId: string;
  cid: string;
  text: string;
  pin?: TurnPin;
  limits?: TurnLimits;
}[];
/** Whether the call arrives behind the gateway (the managed pod). */
let fronted: boolean;

const channel = {
  async fireTurn(
    ctx: { agent: Agent },
    cid: string,
    text: string,
    pin?: TurnPin,
    opts: FireTurnOptions = {},
  ): Promise<void> {
    fired.push({
      agentId: ctx.agent.id,
      cid,
      text,
      pin,
      ...(opts.limits ? { limits: opts.limits } : {}),
    });
  },
} as unknown as RuntimeChannel;

function fakeReq(
  body: unknown,
  headers: Record<string, string> = {},
): IncomingMessage {
  const buf =
    body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body));
  return {
    headers,
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

async function call(
  method: string,
  rest: string,
  body?: unknown,
  callingAgent?: string,
  missionId?: string,
) {
  const deps = {
    store,
    vfs,
    paths,
    channels: { local: channel },
    gatewayFronted: fronted,
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
      ...(callingAgent ? { callingAgent } : {}),
    },
    method,
    url.pathname.split("/").slice(3).join("/"),
    url,
    fakeReq(body, missionId ? { "x-houston-mission-id": missionId } : {}),
    res,
  );
  return { handled, ...captured };
}

test("calling-agent header is trusted only behind the gateway", () => {
  const req = fakeReq(undefined, { [CALLING_AGENT_HEADER]: "verified-caller" });
  expect(trustedCallingAgent({ store, channels: {} }, req)).toBeUndefined();
  expect(
    trustedCallingAgent({ store, channels: {}, gatewayFronted: true }, req),
  ).toBe("verified-caller");
});

test("verified caller overrides body provenance and alone may move the card", async () => {
  const started = await call(
    "POST",
    "missions/start",
    {
      title: "Review",
      prompt: "Review this",
      origin: { ...ORIGIN, agent: "forged" },
    },
    "verified-caller",
    "6db3cf6b-53c5-4d6e-8560-c23ddb4ee0ab",
  );
  expect(started.status).toBe(201);
  const row = (await board())[0];
  expect(row?.origin_agent).toBe("verified-caller");
  if (!row) throw new Error("expected a mission");
  await saveActivities(vfs, root, [{ ...row, status: "needs_you" }]);
  const denied = await call(
    "POST",
    "missions/status",
    {
      id: row.id,
      status: "done",
    },
    "other-caller",
  );
  expect(denied.body).toMatchObject({ code: "not_mission_origin" });
  const accepted = await call(
    "POST",
    "missions/status",
    {
      id: row.id,
      status: "done",
    },
    "verified-caller",
  );
  expect(accepted.status).toBe(200);
});

test("verified caller start uses the gateway mission id and refuses a missing id", async () => {
  const body = { title: "Review", prompt: "Review this", origin: ORIGIN };
  const missing = await call("POST", "missions/start", body, "verified-caller");
  expect(missing.status).toBe(400);
  expect(await board()).toEqual([]);

  const malformed = await call(
    "POST",
    "missions/start",
    body,
    "verified-caller",
    "not-a-uuid",
  );
  expect(malformed.status).toBe(400);
  expect(await board()).toEqual([]);

  const id = "8db59445-dd9b-4773-a8b1-7f165f488b7b";
  const started = await call(
    "POST",
    "missions/start",
    body,
    "verified-caller",
    id,
  );
  expect(started.status).toBe(201);
  expect(started.body).toMatchObject({ id });
  expect((await board())[0]?.id).toBe(id);
  expect(fired[0]?.cid).toBe(`activity-${id}`);

  const duplicate = await call(
    "POST",
    "missions/start",
    body,
    "verified-caller",
    id,
  );
  expect(duplicate.status).toBe(409);
  expect(await board()).toHaveLength(1);
});

test("body provenance without a verified caller grants no move rights", async () => {
  const started = await call("POST", "missions/start", {
    title: "Review",
    prompt: "Review this",
    origin: { ...ORIGIN, agent: "A" },
  });
  expect(started.status).toBe(201);
  const row = (await board())[0];
  expect(row?.origin_agent).toBeUndefined();
  if (!row) throw new Error("expected a mission");
  await saveActivities(vfs, root, [{ ...row, status: "needs_you" }]);
  const denied = await call(
    "POST",
    "missions/status",
    { id: row.id, status: "done" },
    "A",
  );
  expect(denied.status).toBe(403);
  expect(denied.body).toMatchObject({ code: "not_mission_origin" });
});

async function board(): Promise<Activity[]> {
  return JSON.parse(
    (await vfs.readText(docKey(root, "activity"))) ?? "[]",
  ) as Activity[];
}

const ORIGIN = { session_key: "conv-parent", agent: "agent-caller", depth: 1 };

test("mission origin type permits an absent verified calling agent", () => {
  const origin: MissionOrigin = { session_key: "conv-parent", depth: 1 };
  expect(origin.agent).toBeUndefined();
});

beforeEach(async () => {
  store = new MemoryWorkspaceStore({ defaultRuntime: "local" });
  vfs = new MemoryVfs();
  events = [];
  fired = [];
  fronted = true;
  ws = await store.getOrCreatePersonalWorkspace("alice");
  agent = await store.createAgent({ workspaceId: ws.id, name: "Dobby" });
  root = paths.agentRoot(ws, agent);
});

afterEach(() => vi.restoreAllMocks());

test("an agent-started mission retires the target's pending first day", async () => {
  await saveConfig(vfs, root, { firstDay: "pending", model: "sonnet" });
  const result = await call("POST", "missions/start", {
    title: "Begin the work",
    prompt: "Start now.",
    origin: ORIGIN,
  });
  expect(result.status).toBe(201);
  expect((await loadConfig(vfs, root)).config).toMatchObject({
    firstDay: "started",
    model: "sonnet",
  });
  expect(events).toContainEqual({
    type: "ConfigChanged",
    agentPath: agent.id,
  });
});

test.each(["started", undefined] as const)(
  "an agent-started mission leaves firstDay %s untouched",
  async (firstDay) => {
    await saveConfig(vfs, root, firstDay ? { firstDay } : { model: "sonnet" });
    const write = vi.spyOn(vfs, "writeText");
    const result = await call("POST", "missions/start", {
      title: "Begin the work",
      prompt: "Start now.",
      origin: ORIGIN,
    });
    expect(result.status).toBe(201);
    expect(write).not.toHaveBeenCalledWith(
      docKey(root, "config"),
      expect.anything(),
    );
    expect(events).not.toContainEqual({
      type: "ConfigChanged",
      agentPath: agent.id,
    });
  },
);

test("a failed config write does not fail an agent-started mission", async () => {
  await saveConfig(vfs, root, { firstDay: "pending" });
  const write = vfs.writeText.bind(vfs);
  vi.spyOn(vfs, "writeText").mockImplementation((key, content) =>
    key === docKey(root, "config")
      ? Promise.reject(new Error("config unavailable"))
      : write(key, content),
  );
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  const result = await call("POST", "missions/start", {
    title: "Begin the work",
    prompt: "Start now.",
    origin: ORIGIN,
  });
  expect(result.status).toBe(201);
  expect(await board()).toHaveLength(1);
  expect(fired).toHaveLength(1);
  expect((await loadConfig(vfs, root)).config.firstDay).toBe("pending");
  expect(logged).toHaveBeenCalledWith(
    expect.stringContaining("retiring pending start failed"),
    expect.any(Error),
  );
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
  // An unverified body cannot name the mission's starter, while the validated
  // depth remains available when the parent pod is out of reach.
  expect(created?.origin_agent).toBeUndefined();
  expect(created?.origin_depth).toBe(1);
  // Attribution comes from the gateway-verified acting identity, not the body.
  expect(created?.created_by).toBe("u-1");
  // The mode it was started in is the one its chat keeps (HOU-205).
  expect(created?.mode).toBe("auto");
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
  expect(deep.body).toMatchObject({
    code: "mission_depth",
    error:
      "a mission started by another mission can't start further missions - ask in the original chat instead",
  });
  expect(await board()).toEqual([]);
  expect(fired).toEqual([]);

  // A depth that is not a real level at all: zero, negative, fractional. The
  // ceiling is a range check, not an equality test, so none of these slips past.
  for (const depth of [0, -1, 1.5, Number.NaN]) {
    const bogus = await call("POST", "missions/start", {
      title: "t",
      prompt: "p",
      origin: { ...ORIGIN, depth },
    });
    expect(bogus.status).toBe(409);
    expect((bogus.body as { code: string }).code).toBe("mission_depth");
  }
  expect(await board()).toEqual([]);
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

test("per-mission read reports a running row beyond the compact board limit", async () => {
  await saveActivities(vfs, root, [
    {
      id: "old",
      title: "Older work",
      description: "",
      status: "running",
      updated_at: "2020-01-01",
    },
    ...Array.from({ length: 100 }, (_, i) => ({
      id: `new-${i}`,
      title: `New ${i}`,
      description: "",
      status: "done" as const,
      updated_at: "2026-01-01",
    })),
  ]);
  const listed = await call("GET", "missions");
  expect(
    (listed.body as { missions: { id: string }[] }).missions,
  ).not.toContainEqual(expect.objectContaining({ id: "old" }));
  const read = await call("GET", "missions/read?id=old");
  expect(read.status).toBe(200);
  expect(read.body).toMatchObject({ id: "old", status: "running" });
});

test("a deleted board row refuses per-mission read even when its conversation remains", async () => {
  await vfs.writeText(
    conversationKey(paths, ws, agent, "activity-deleted"),
    JSON.stringify({
      title: "Old chat",
      messages: [{ role: "assistant", content: "Done" }],
    }),
  );
  const read = await call("GET", "missions/read?id=deleted");
  expect(read.status).toBe(404);
  expect(read.body).toMatchObject({ code: "mission_not_found" });
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

test.each(["missions?agent=Other", "missions/read?agent=Other&id=m-1"])(
  "inbound %s refuses a second target",
  async (rest) => {
    const result = await call("GET", rest);
    expect(result.status).toBe(400);
    expect(result.body).toMatchObject({ code: "invalid_agent" });
  },
);
test("the inbound start echoes resolved provider and model", async () => {
  const result = await call("POST", "missions/start", {
    title: "t",
    prompt: "p",
    origin: ORIGIN,
    provider: "codex",
    model: "Luna",
  });
  expect(result.body).toMatchObject({
    provider: "openai-codex",
    model: "gpt-6-luna",
  });
});

/** A start carrying exactly `headers`, on a pod fronted or not. */
async function startWith(
  headers: Record<string, string>,
  opts: { gatewayFronted: boolean; callingAgent?: string },
): Promise<Activity | undefined> {
  const deps = {
    store,
    vfs,
    paths,
    channels: { local: channel },
    gatewayFronted: opts.gatewayFronted,
    events: { emit: () => {} },
  } as unknown as MissionsDeps;
  const { res, captured } = fakeRes();
  const body = { title: "t", prompt: "p", origin: ORIGIN };
  const req = fakeReq(body, headers);
  Object.assign(req, { socket: { remoteAddress: "127.0.0.1" } });
  await handleAgentMissions(
    deps,
    {
      workspace: ws,
      agent,
      ...(opts.callingAgent ? { callingAgent: opts.callingAgent } : {}),
    },
    "POST",
    "missions/start",
    new URL(`http://pod/agents/${agent.id}/missions/start`),
    req,
    res,
  );
  expect(captured.status).toBe(201);
  return (await board()).at(-1);
}

const viaAssistant = {
  [ACTING_AS_HEADER]: `acting-v1.${Buffer.from(
    JSON.stringify({ sub: "u-1", via: "assistant" }),
  ).toString("base64url")}.sig`,
};

test("a start the gateway minted for the AI Manager is stamped as Houston's", async () => {
  const row = await startWith(viaAssistant, { gatewayFronted: true });
  expect(row?.started_by).toBe("houston");
});

test("a start from a verified calling agent is stamped as an employee's", async () => {
  const row = await startWith(
    {
      ...viaAssistant,
      "x-houston-mission-id": "0d3b1c7e-2f4a-4b8c-9d6e-1a2b3c4d5e6f",
    },
    { gatewayFronted: true, callingAgent: "verified-caller" },
  );
  expect(row?.started_by).toBe("employee");
});

test("a person's direct start records no starter", async () => {
  const row = await startWith({}, { gatewayFronted: true });
  expect(row && "started_by" in row).toBe(false);
});

test("off the gateway, an acting header claiming the manager is ignored", async () => {
  const row = await startWith(viaAssistant, { gatewayFronted: false });
  expect(row && "started_by" in row).toBe(false);
});

test("off the gateway, the dispatcher's loopback proof marks the manager", async () => {
  const row = await startWith(assistantCallHeaders(), {
    gatewayFronted: false,
  });
  expect(row?.started_by).toBe("houston");
});

test.each([
  [true, { routineMinIntervalMinutes: 15 }],
  [false, undefined],
])(
  "the gateway's plan stamp on a start rides the child turn (fronted: %s)",
  async (behindGateway, expected) => {
    fronted = behindGateway;
    const r = await call("POST", "missions/start", {
      title: "Watch the inbox",
      prompt: "Set up a check.",
      origin: ORIGIN,
      limits: { routineMinIntervalMinutes: 15 },
    });
    expect(r.status).toBe(201);
    expect(fired).toHaveLength(1);
    expect(fired[0]?.limits).toEqual(expected);
  },
);
