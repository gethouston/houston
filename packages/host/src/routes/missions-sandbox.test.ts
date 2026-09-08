import type { IncomingMessage, ServerResponse } from "node:http";
import { docKey, saveActivities } from "@houston/domain";
import type { Activity, HoustonEvent } from "@houston/protocol";
import { beforeEach, expect, test } from "vitest";
import type { Agent, Workspace } from "../domain/types";
import { LocalPaths } from "../paths";
import type {
  CredentialStore,
  CredentialVault,
  RuntimeChannel,
  TurnPin,
  WorkspaceCredential,
} from "../ports";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";
import { CONVERSATION_ID_HEADER } from "./learnings-sandbox";
import { handleSandboxMissions } from "./missions-sandbox";

/**
 * The runtime-facing mission board routes (PRODUCT-1244). Invariants:
 *  - `start` creates the board row FIRST (origin-stamped, merge-safe, evented)
 *    and fires the child turn through the same channel a routine firing uses;
 *    a failed fire rolls the row back so no card sticks on Running.
 *  - Depth 1: an agent-started mission can't start missions of its own.
 *  - `status` moves only FINISHED missions, never the calling conversation's.
 *  - `settle` applies ONLY to agent-started missions still running — user
 *    missions keep the client-side settle path untouched.
 */

const paths = new LocalPaths();

let store: MemoryWorkspaceStore;
let vfs: MemoryVfs;
let ws: Workspace;
let agent: Agent;
let root: string;
let events: HoustonEvent[];
let fired: { cid: string; text: string; pin?: TurnPin }[];
let fireError: Error | null;
/** Which providers the host's central credential store holds a row for, or
 *  null for a deployment that has no store to judge with. */
let connectedProviders: string[] | null;

const vault: CredentialVault = {
  sandboxToken: () => "sb",
  validateSandboxToken: (token) =>
    token === "sb-good" ? { workspaceId: ws.id, agentId: agent.id } : null,
};

const credentials = {
  async get(
    _ws: string,
    provider: string,
  ): Promise<WorkspaceCredential | null> {
    return connectedProviders?.includes(provider)
      ? ({ provider } as WorkspaceCredential)
      : null;
  },
} as unknown as CredentialStore;

const channel = {
  async fireTurn(
    _ctx: unknown,
    cid: string,
    text: string,
    pin?: TurnPin,
  ): Promise<void> {
    if (fireError) throw fireError;
    fired.push({ cid, text, pin });
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
  opts: { conversationId?: string; token?: string } = {},
) {
  const headers: Record<string, string> = {
    authorization: `Bearer ${opts.token ?? "sb-good"}`,
  };
  if (opts.conversationId)
    headers[CONVERSATION_ID_HEADER] = opts.conversationId;
  const { res, captured } = fakeRes();
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
      ...(connectedProviders === null ? {} : { credentials }),
    },
    method,
    path,
    new URL(`http://host${path}`),
    fakeReq(body, headers),
    res,
  );
  return { handled, ...captured };
}

async function onDisk(): Promise<Activity[]> {
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
  fireError = null;
  connectedProviders = null;
  ws = await store.getOrCreatePersonalWorkspace("alice");
  agent = await store.createAgent({ workspaceId: ws.id, name: "Helper" });
  root = paths.agentRoot(ws, agent);
  await saveActivities(vfs, root, [PARENT]);
});

test("a bad sandbox token is rejected", async () => {
  const r = await call("GET", "/sandbox/missions", undefined, {
    token: "sb-bad",
  });
  expect(r.handled).toBe(true);
  expect(r.status).toBe(401);
});

test("start creates an origin-stamped row and fires the child turn", async () => {
  const r = await call(
    "POST",
    "/sandbox/missions/start",
    {
      title: "Draft the invite",
      prompt: "Write the invite email.",
      mode: "auto",
    },
    { conversationId: "conv-parent" },
  );
  expect(r.status).toBe(201);
  const created = (await onDisk()).find((a) => a.id !== PARENT.id);
  expect(created?.title).toBe("Draft the invite");
  expect(created?.status).toBe("running");
  expect(created?.origin_session_key).toBe("conv-parent");
  expect(created?.description).toBe("Write the invite email.");
  expect(fired).toEqual([
    {
      cid: `activity-${created?.id}`,
      text: "Write the invite email.",
      pin: { mode: "auto" },
    },
  ]);
  expect(events).toContainEqual({
    type: "ActivityChanged",
    agentPath: agent.id,
  });
});

test("start outside a turn (no conversation header) is refused", async () => {
  const r = await call("POST", "/sandbox/missions/start", {
    title: "t",
    prompt: "p",
  });
  expect(r.status).toBe(400);
  expect(fired).toEqual([]);
});

test("start validates mode and provider", async () => {
  const bad = await call(
    "POST",
    "/sandbox/missions/start",
    { title: "t", prompt: "p", mode: "yolo" },
    { conversationId: "conv-parent" },
  );
  expect(bad.status).toBe(400);
  const prov = await call(
    "POST",
    "/sandbox/missions/start",
    { title: "t", prompt: "p", provider: "not-a-provider" },
    { conversationId: "conv-parent" },
  );
  expect(prov.status).toBe(400);
  expect(fired).toEqual([]);
});

test("a friendly provider name starts the mission on the real id", async () => {
  connectedProviders = ["openai-codex"];
  const r = await call(
    "POST",
    "/sandbox/missions/start",
    { title: "t", prompt: "p", provider: "codex", model: "gpt-5.5" },
    { conversationId: "conv-parent" },
  );
  expect(r.status).toBe(201);
  // The pin must reach the TURN, not just the board row: a mission whose first
  // turn runs on the agent's default provider is a silent substitution.
  expect(fired[0]?.pin).toMatchObject({
    provider: "openai-codex",
    model: "gpt-5.5",
  });
  const created = (await onDisk()).find((a) => a.id !== PARENT.id);
  expect(created?.provider).toBe("openai-codex");
  expect(created?.model).toBe("gpt-5.5");
});

test("the name a user says for a model reaches the turn as its id", async () => {
  connectedProviders = ["openai-codex"];
  const r = await call(
    "POST",
    "/sandbox/missions/start",
    { title: "t", prompt: "p", provider: "codex", model: "Luna" },
    { conversationId: "conv-parent" },
  );
  expect(r.status).toBe(201);
  expect(fired[0]?.pin).toMatchObject({
    provider: "openai-codex",
    model: "gpt-5.6-luna",
  });
  const created = (await onDisk()).find((a) => a.id !== PARENT.id);
  expect(created?.model).toBe("gpt-5.6-luna");
});

test("an unknown provider is refused with the ids and names that would work", async () => {
  connectedProviders = ["openai-codex", "google"];
  const r = await call(
    "POST",
    "/sandbox/missions/start",
    { title: "t", prompt: "p", provider: "gemini-cli" },
    { conversationId: "conv-parent" },
  );
  expect(r.status).toBe(400);
  const error = (r.body as { error: string }).error;
  expect(error).toContain("openai-codex (ChatGPT / Codex (Plus / Pro))");
  expect(error).toContain("google (Google Gemini)");
  expect(error).not.toContain("deepseek");
  expect(fired).toEqual([]);
});

test("a real provider nobody connected is refused by name, not started", async () => {
  connectedProviders = ["openai-codex"];
  const r = await call(
    "POST",
    "/sandbox/missions/start",
    { title: "t", prompt: "p", provider: "deepseek" },
    { conversationId: "conv-parent" },
  );
  expect(r.status).toBe(400);
  const error = (r.body as { error: string }).error;
  expect(error).toContain("deepseek (DeepSeek)");
  expect(error).toMatch(/not connected/i);
  expect(fired).toEqual([]);
  expect((await onDisk()).length).toBe(1);
});

test("with no credential store to judge with, a known provider still starts", async () => {
  const r = await call(
    "POST",
    "/sandbox/missions/start",
    { title: "t", prompt: "p", provider: "Claude (Pro / Max)" },
    { conversationId: "conv-parent" },
  );
  expect(r.status).toBe(201);
  expect(fired[0]?.pin?.provider).toBe("anthropic");
});

test("depth 1: an agent-started mission can't start missions", async () => {
  await saveActivities(vfs, root, [
    { ...PARENT, origin_session_key: "conv-grandparent" },
  ]);
  const r = await call(
    "POST",
    "/sandbox/missions/start",
    { title: "t", prompt: "p" },
    { conversationId: "conv-parent" },
  );
  expect(r.status).toBe(409);
  expect((await onDisk()).length).toBe(1);
  expect(fired).toEqual([]);
});

test("the running cap refuses a flood", async () => {
  const running = Array.from({ length: 20 }, (_, i) => ({
    id: `r-${i}`,
    title: `m${i}`,
    description: "",
    status: "running",
  }));
  await saveActivities(vfs, root, [PARENT, ...running]);
  const r = await call(
    "POST",
    "/sandbox/missions/start",
    { title: "t", prompt: "p" },
    { conversationId: "conv-parent" },
  );
  expect(r.status).toBe(409);
  expect(fired).toEqual([]);
});

test("a failed fire rolls the row back — no orphan Running card", async () => {
  fireError = new Error("runtime unreachable");
  const r = await call(
    "POST",
    "/sandbox/missions/start",
    { title: "t", prompt: "p" },
    { conversationId: "conv-parent" },
  );
  expect(r.status).toBe(502);
  expect(await onDisk()).toEqual([PARENT]);
});

test("list returns the compact board with flags", async () => {
  await saveActivities(vfs, root, [
    PARENT,
    {
      id: "child-1",
      title: "Draft",
      description: "",
      status: "needs_you",
      origin_session_key: "conv-parent",
      updated_at: "2026-08-06T00:00:00.000Z",
    },
  ]);
  const r = await call("GET", "/sandbox/missions", undefined, {
    conversationId: "conv-parent",
  });
  expect(r.status).toBe(200);
  const { missions } = r.body as { missions: Record<string, unknown>[] };
  const child = missions.find((m) => m.id === "child-1");
  expect(child).toMatchObject({ status: "needs_you", agent_started: true });
  const parent = missions.find((m) => m.id === "parent-1");
  expect(parent).toMatchObject({ this_conversation: true });
});

test("status moves a finished mission and refuses the rest", async () => {
  await saveActivities(vfs, root, [
    PARENT,
    { id: "m-done", title: "a", description: "", status: "needs_you" },
    { id: "m-run", title: "b", description: "", status: "running" },
  ]);
  const ok = await call(
    "POST",
    "/sandbox/missions/status",
    { id: "m-done", status: "done" },
    { conversationId: "conv-parent" },
  );
  expect(ok.status).toBe(200);
  expect((await onDisk()).find((a) => a.id === "m-done")?.status).toBe("done");

  const run = await call(
    "POST",
    "/sandbox/missions/status",
    { id: "m-run", status: "done" },
    { conversationId: "conv-parent" },
  );
  expect(run.status).toBe(409);

  // The calling conversation's own (settled) mission is refused too.
  await saveActivities(vfs, root, [{ ...PARENT, status: "needs_you" }]);
  const self = await call(
    "POST",
    "/sandbox/missions/status",
    { id: "parent-1", status: "done" },
    { conversationId: "conv-parent" },
  );
  expect(self.status).toBe(409);

  const missing = await call(
    "POST",
    "/sandbox/missions/status",
    { id: "nope", status: "done" },
    { conversationId: "conv-parent" },
  );
  expect(missing.status).toBe(404);
});

test("settle applies only to agent-started missions still running", async () => {
  await saveActivities(vfs, root, [
    PARENT,
    {
      id: "child-1",
      title: "Draft",
      description: "",
      status: "running",
      origin_session_key: "conv-parent",
    },
  ]);
  // A user mission (no origin marker) is never touched.
  const user = await call("POST", "/sandbox/missions/settle", {
    conversation_id: "conv-parent",
    status: "needs_you",
  });
  expect(user.body).toEqual({ ok: false });
  expect((await onDisk()).find((a) => a.id === "parent-1")?.status).toBe(
    "running",
  );

  // The agent-started child settles by its activity-<id> conversation.
  const child = await call("POST", "/sandbox/missions/settle", {
    conversation_id: "activity-child-1",
    status: "needs_you",
    pending_interaction: {
      steps: [{ kind: "question", id: "q1", question: "Which tone?" }],
    },
  });
  expect(child.body).toEqual({ ok: true });
  const settled = (await onDisk()).find((a) => a.id === "child-1");
  expect(settled?.status).toBe("needs_you");
  expect(settled?.pending_interaction?.steps[0]?.id).toBe("q1");

  // A second settle (already off `running`) is a no-op.
  const again = await call("POST", "/sandbox/missions/settle", {
    conversation_id: "activity-child-1",
    status: "error",
  });
  expect(again.body).toEqual({ ok: false });
  expect((await onDisk()).find((a) => a.id === "child-1")?.status).toBe(
    "needs_you",
  );
});

test("a non-matching path is not handled", async () => {
  const { res } = fakeRes();
  const handled = await handleSandboxMissions(
    { vault, store, vfs, paths, channels: { local: channel } },
    "GET",
    "/sandbox/other",
    new URL("http://host/sandbox/other"),
    fakeReq({}, {}),
    res,
  );
  expect(handled).toBe(false);
});
