import type { IncomingMessage, ServerResponse } from "node:http";
import { docKey, saveActivities } from "@houston/domain";
import type { Activity, HoustonEvent } from "@houston/protocol";
import { beforeEach, expect, test } from "vitest";
import type { Agent, Workspace } from "../domain/types";
import { conversationKey, LocalPaths } from "../paths";
import type { CredentialVault, RuntimeChannel, TurnPin } from "../ports";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";
import { CONVERSATION_ID_HEADER } from "./learnings-sandbox";
import { handleSandboxMissions } from "./missions-sandbox";

/**
 * Cross-agent missions: a caller names another agent and the mission lands on
 * THAT agent's board, started exactly like a UI-created one. This is what the
 * personal assistant needs — it keeps no board of its own, so work it starts
 * must live where the user can see it.
 *
 * Invariants pinned here:
 *  - the row is created on the TARGET, evented for the TARGET, and its first
 *    turn fires on the TARGET's channel context;
 *  - resolution is fail-closed (unknown name → 404, another user's agent →
 *    404, a hidden dot-agent → 404) and never leaks a name the caller can't see;
 *  - the depth guard reads the CALLER's board (that is where the parent chat
 *    lives) while the running cap counts the TARGET's board;
 *  - list / status / read all accept the same target and act on it.
 */

const paths = new LocalPaths();

let store: MemoryWorkspaceStore;
let vfs: MemoryVfs;
let ws: Workspace;
let caller: Agent;
let target: Agent;
let otherWs: Workspace;
let otherUsersAgent: Agent;
let callerRoot: string;
let targetRoot: string;
let events: HoustonEvent[];
let fired: { agentId: string; cid: string; text: string; pin?: TurnPin }[];

const vault: CredentialVault = {
  sandboxToken: () => "sb",
  validateSandboxToken: (token) =>
    token === "sb-good" ? { workspaceId: ws.id, agentId: caller.id } : null,
};

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

function fakeReq(
  body: unknown,
  headers: Record<string, string>,
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
  path: string,
  body: unknown,
  opts: { conversationId?: string; search?: string } = {},
) {
  const headers: Record<string, string> = { authorization: "Bearer sb-good" };
  if (opts.conversationId)
    headers[CONVERSATION_ID_HEADER] = opts.conversationId;
  const { res, captured } = fakeRes();
  const url = new URL(`http://host${path}${opts.search ?? ""}`);
  const handled = await handleSandboxMissions(
    {
      vault,
      store,
      vfs,
      paths,
      events: {
        emit: (_userId: string, event: HoustonEvent) => events.push(event),
      } as never,
      channels: { local: channel },
    },
    method,
    path,
    url,
    fakeReq(body, headers),
    res,
  );
  return { handled, ...captured };
}

async function boardOf(root: string): Promise<Activity[]> {
  return JSON.parse(
    (await vfs.readText(docKey(root, "activity"))) ?? "[]",
  ) as Activity[];
}

const PARENT: Activity = {
  id: "parent-1",
  title: "Plan the launch",
  description: "",
  status: "running",
  session_key: "conv-parent",
};

beforeEach(async () => {
  store = new MemoryWorkspaceStore({ defaultRuntime: "local" });
  vfs = new MemoryVfs();
  events = [];
  fired = [];
  ws = await store.getOrCreatePersonalWorkspace("alice");
  caller = await store.createAgent({ workspaceId: ws.id, name: "Helper" });
  target = await store.createAgent({ workspaceId: ws.id, name: "Dobby" });
  otherWs = await store.getOrCreatePersonalWorkspace("bob");
  otherUsersAgent = await store.createAgent({
    workspaceId: otherWs.id,
    name: "Winky",
  });
  callerRoot = paths.agentRoot(ws, caller);
  targetRoot = paths.agentRoot(ws, target);
  await saveActivities(vfs, callerRoot, [PARENT]);
});

test("a named agent gets the mission on ITS board, started like a UI mission", async () => {
  const r = await call(
    "POST",
    "/sandbox/missions/start",
    {
      agent: "Dobby",
      title: "Roast the website",
      prompt: "Review houston.ai and roast the copy.",
      mode: "auto",
    },
    { conversationId: "conv-parent" },
  );
  expect(r.status).toBe(201);

  // The row lives on the target, with the UI-created shape plus the
  // server-stamped agent-started marker.
  const created = (await boardOf(targetRoot))[0];
  expect(created?.title).toBe("Roast the website");
  expect(created?.status).toBe("running");
  expect(created?.description).toBe("Review houston.ai and roast the copy.");
  expect(created?.origin_session_key).toBe("conv-parent");
  // The caller's own board is untouched — no hidden second copy.
  expect(await boardOf(callerRoot)).toEqual([PARENT]);

  // The first turn fires on the TARGET's runtime, in the mission's own chat.
  expect(fired).toEqual([
    {
      agentId: target.id,
      cid: `activity-${created?.id}`,
      text: "Review houston.ai and roast the copy.",
      pin: { mode: "auto" },
    },
  ]);
  // Reactivity names the target, so the target's board refreshes.
  expect(events).toContainEqual({
    type: "ActivityChanged",
    agentPath: target.id,
  });
  expect(events).not.toContainEqual({
    type: "ActivityChanged",
    agentPath: caller.id,
  });
});

test("a cross-agent pin reaches the TARGET's first turn, not just its board row", async () => {
  // The incident: provider + model landed on Dobby's row while Dobby's first
  // turn ran on Dobby's default provider, with no error anywhere.
  const r = await call(
    "POST",
    "/sandbox/missions/start",
    {
      agent: "Dobby",
      title: "Roast the website",
      prompt: "Roast it.",
      provider: "openai-codex",
      model: "gpt-5.5",
    },
    { conversationId: "conv-parent" },
  );
  expect(r.status).toBe(201);
  const created = (await boardOf(targetRoot))[0];
  expect(created?.provider).toBe("openai-codex");
  expect(created?.model).toBe("gpt-5.5");
  expect(fired[0]?.agentId).toBe(target.id);
  expect(fired[0]?.pin).toMatchObject({
    provider: "openai-codex",
    model: "gpt-5.5",
  });
});

test("resolution is fail-closed: unknown, hidden and other users' agents", async () => {
  const unknown = await call(
    "POST",
    "/sandbox/missions/start",
    { agent: "Kreacher", title: "t", prompt: "p" },
    { conversationId: "conv-parent" },
  );
  expect(unknown.status).toBe(404);
  // The message names the agents the caller CAN reach, so the model corrects
  // itself instead of guessing again.
  expect(String((unknown.body as { error: string }).error)).toContain("Dobby");

  const hidden = await call(
    "POST",
    "/sandbox/missions/start",
    { agent: ".assistant", title: "t", prompt: "p" },
    { conversationId: "conv-parent" },
  );
  expect(hidden.status).toBe(404);

  const foreign = await call(
    "POST",
    "/sandbox/missions/start",
    { agent: otherUsersAgent.id, title: "t", prompt: "p" },
    { conversationId: "conv-parent" },
  );
  expect(foreign.status).toBe(404);
  expect(fired).toEqual([]);
});

test("an agent id resolves as well as a name", async () => {
  const r = await call(
    "POST",
    "/sandbox/missions/start",
    { agent: target.id, title: "By id", prompt: "p" },
    { conversationId: "conv-parent" },
  );
  expect(r.status).toBe(201);
  expect((await boardOf(targetRoot))[0]?.title).toBe("By id");
});

test("the depth guard reads the caller's board, the cap counts the target's", async () => {
  // The calling chat is itself an agent-started mission: depth 1 refuses,
  // even though the target's board is empty.
  await saveActivities(vfs, callerRoot, [
    { ...PARENT, origin_session_key: "conv-grandparent" },
  ]);
  const depth = await call(
    "POST",
    "/sandbox/missions/start",
    { agent: "Dobby", title: "t", prompt: "p" },
    { conversationId: "conv-parent" },
  );
  expect(depth.status).toBe(409);
  expect(await boardOf(targetRoot)).toEqual([]);

  // A flooded TARGET board refuses too, even though the caller's is empty.
  await saveActivities(vfs, callerRoot, [PARENT]);
  await saveActivities(
    vfs,
    targetRoot,
    Array.from({ length: 20 }, (_, i) => ({
      id: `r-${i}`,
      title: `m${i}`,
      description: "",
      status: "running" as const,
    })),
  );
  const cap = await call(
    "POST",
    "/sandbox/missions/start",
    { agent: "Dobby", title: "t", prompt: "p" },
    { conversationId: "conv-parent" },
  );
  expect(cap.status).toBe(409);
  expect(fired).toEqual([]);
});

test("list, status and read all act on the named agent's board", async () => {
  await saveActivities(vfs, targetRoot, [
    {
      id: "m-1",
      title: "Roast the website",
      description: "",
      status: "needs_you",
      origin_session_key: "conv-parent",
      updated_at: "2026-09-01T00:00:00.000Z",
    },
  ]);

  const listed = await call("GET", "/sandbox/missions", undefined, {
    conversationId: "conv-parent",
    search: "?agent=Dobby",
  });
  expect(listed.status).toBe(200);
  expect((listed.body as { missions: { id: string }[] }).missions).toHaveLength(
    1,
  );
  // The caller's own board is a different list.
  const own = await call("GET", "/sandbox/missions", undefined, {
    conversationId: "conv-parent",
  });
  expect((own.body as { missions: { id: string }[] }).missions[0]?.id).toBe(
    "parent-1",
  );

  // The mission's transcript is read from the TARGET's data root.
  await vfs.writeText(
    conversationKey(paths, ws, target, "activity-m-1"),
    JSON.stringify({
      id: "activity-m-1",
      title: "Roast the website",
      createdAt: 1,
      updatedAt: 2,
      messages: [
        { role: "user", content: "Roast it", ts: 1 },
        { role: "assistant", content: "Here is the roast", ts: 2 },
      ],
    }),
  );
  const read = await call("GET", "/sandbox/missions/read", undefined, {
    conversationId: "conv-parent",
    search: "?agent=Dobby&id=m-1",
  });
  expect(read.status).toBe(200);
  const transcript = read.body as {
    title: string;
    messages: { role: string; content: string }[];
    totalMessages: number;
  };
  expect(transcript.title).toBe("Roast the website");
  expect(transcript.totalMessages).toBe(2);
  expect(transcript.messages.at(-1)?.content).toBe("Here is the roast");

  const moved = await call(
    "POST",
    "/sandbox/missions/status",
    { agent: "Dobby", id: "m-1", status: "done" },
    { conversationId: "conv-parent" },
  );
  expect(moved.status).toBe(200);
  expect((await boardOf(targetRoot))[0]?.status).toBe("done");
});

test("read answers 404 for a mission that has no transcript yet", async () => {
  const r = await call("GET", "/sandbox/missions/read", undefined, {
    conversationId: "conv-parent",
    search: "?agent=Dobby&id=nope",
  });
  expect(r.status).toBe(404);
});
