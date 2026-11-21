import type { IncomingMessage, ServerResponse } from "node:http";
import { docKey, saveActivities, saveLearnings } from "@houston/domain";
import type { Activity, HoustonEvent, Learning } from "@houston/protocol";
import { beforeEach, expect, test } from "vitest";
import type { Agent, Workspace } from "../domain/types";
import { LocalPaths } from "../paths";
import type { CredentialVault } from "../ports";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";
import {
  CONVERSATION_ID_HEADER,
  handleSandboxLearnings,
} from "./learnings-sandbox";
import { liveTurns } from "./live-turn";

const paths = new LocalPaths();
const OWNER = "alice";

let store: MemoryWorkspaceStore;
let vfs: MemoryVfs;
let ws: Workspace;
let agent: Agent;
let root: string;
let events: HoustonEvent[];

const vault: CredentialVault = {
  sandboxToken: () => "sb",
  validateSandboxToken: (token) =>
    token === "sb-good" ? { workspaceId: ws.id, agentId: agent.id } : null,
};

function actingHeader(sub: string, name?: string): string {
  const payload = Buffer.from(JSON.stringify({ sub, name })).toString(
    "base64url",
  );
  return `acting-v1.${payload}.sig`;
}

function fakeReq(
  body: unknown,
  headers: Record<string, string>,
): IncomingMessage {
  const buf = Buffer.from(JSON.stringify(body));
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

async function save(
  text: string,
  opts: {
    gatewayFronted?: boolean;
    acting?: string;
    actingUser?: string;
    spoofedActing?: string;
    spoofedActingUser?: string;
    conversationId?: string | null;
    noLiveTurn?: boolean;
    mode?: "plan" | "execute" | "auto";
    token?: string;
  } = {},
) {
  const headers: Record<string, string> = {
    authorization: `Bearer ${opts.token ?? "sb-good"}`,
  };
  if (opts.spoofedActing) headers["x-houston-acting-as"] = opts.spoofedActing;
  if (opts.spoofedActingUser)
    headers["x-houston-acting-user"] = opts.spoofedActingUser;
  const conversationId =
    opts.conversationId === null
      ? undefined
      : (opts.conversationId ?? "conv-none");
  if (conversationId) headers[CONVERSATION_ID_HEADER] = conversationId;
  liveTurns.forget(agent.id);
  if (conversationId && !opts.noLiveTurn)
    liveTurns.start(agent.id, conversationId, opts.mode ?? "execute", {
      actingAs: opts.acting,
      actingUser: opts.actingUser,
    });
  const { res, captured } = fakeRes();
  const handled = await handleSandboxLearnings(
    {
      vault,
      store,
      vfs,
      paths,
      events: {
        emit: (_userId: string, event: HoustonEvent) => events.push(event),
      } as never,
      ...(opts.gatewayFronted ? { gatewayFronted: true } : {}),
    },
    "POST",
    "/sandbox/learnings/save",
    new URL("http://host/sandbox/learnings/save"),
    fakeReq({ text }, headers),
    res,
  );
  return { handled, ...captured };
}

async function onDisk(): Promise<Learning[]> {
  return JSON.parse(
    (await vfs.readText(docKey(root, "learnings"))) ?? "[]",
  ) as Learning[];
}

const MISSION: Activity = {
  id: "act-1",
  title: "Q3 pipeline",
  description: "",
  status: "running",
  session_key: "conv-42",
};

beforeEach(async () => {
  store = new MemoryWorkspaceStore({ defaultRuntime: "local" });
  vfs = new MemoryVfs();
  events = [];
  ws = await store.getOrCreatePersonalWorkspace(OWNER);
  agent = await store.createAgent({ workspaceId: ws.id, name: "Helper" });
  root = paths.agentRoot(ws, agent);
  await saveActivities(vfs, root, [MISSION]);
});

test("a bad sandbox token is rejected before anything is written", async () => {
  const r = await save("nope", { token: "sb-bad" });
  expect(r.handled).toBe(true);
  expect(r.status).toBe(401);
  expect(await onDisk()).toEqual([]);
});

test("an empty text is rejected", async () => {
  const r = await save("   ");
  expect(r.status).toBe(400);
  expect(await onDisk()).toEqual([]);
});

test("gateway-fronted: stamps the person AND the mission", async () => {
  const r = await save("Exclude churned accounts from pipeline math", {
    gatewayFronted: true,
    acting: actingHeader("u-felipe", "Felipe"),
    conversationId: "conv-42",
  });
  expect(r.status).toBe(201);

  const [learning, ...rest] = await onDisk();
  expect(rest).toEqual([]);
  expect(learning?.text).toBe("Exclude churned accounts from pipeline math");
  expect(learning?.taught_by).toEqual({ user_id: "u-felipe", name: "Felipe" });
  expect(learning?.mission_id).toBe("act-1");
  expect(learning?.mission_title).toBe("Q3 pipeline");
  expect(events).toEqual([{ type: "LearningsChanged", agentPath: agent.id }]);
});

test("gateway-fronted fired routine: the creator's acting-user sub is the author", async () => {
  const r = await save("Renewal emails go out on Mondays", {
    gatewayFronted: true,
    actingUser: "sub-alice",
    conversationId: "conv-42",
  });
  expect(r.status).toBe(201);
  expect((await onDisk())[0]?.taught_by).toEqual({ user_id: "sub-alice" });
});

test("gateway-fronted with NO identity at all stamps no person", async () => {
  const r = await save("nobody taught this", { gatewayFronted: true });
  expect(r.status).toBe(201);
  expect((await onDisk())[0]).not.toHaveProperty("taught_by");
});

test("off the gateway: an acting-user header is ignored too", async () => {
  await save("desktop", { actingUser: "sub-attacker" });
  expect((await onDisk())[0]).not.toHaveProperty("taught_by");
});

test("off the gateway: no identity key even when the header is present", async () => {
  const r = await save("Invoices go out on the 1st", {
    acting: actingHeader("u-attacker", "Mallory"),
    conversationId: "conv-42",
  });
  expect(r.status).toBe(201);

  const [learning] = await onDisk();
  expect(learning).not.toHaveProperty("taught_by");
  expect(learning?.mission_id).toBe("act-1");
  expect(learning?.mission_title).toBe("Q3 pipeline");
});

test("the mission matches by session_key", async () => {
  await save("a", { conversationId: "conv-42" });
  expect((await onDisk())[0]?.mission_id).toBe("act-1");
});

test("the mission matches by the activity-<id> fallback", async () => {
  await saveActivities(vfs, root, [
    { ...MISSION, id: "act-9", title: "Renewals", session_key: undefined },
  ]);
  await save("a", { conversationId: "activity-act-9" });
  const [learning] = await onDisk();
  expect(learning?.mission_id).toBe("act-9");
  expect(learning?.mission_title).toBe("Renewals");
});

test("a conversation with no mission behind it stamps no mission keys", async () => {
  await save("no mission");
  await save("unknown cid", { conversationId: "conv-nope" });
  for (const learning of await onDisk()) {
    expect(learning).not.toHaveProperty("mission_id");
    expect(learning).not.toHaveProperty("mission_title");
  }
});

test("the save merges: existing learnings survive", async () => {
  await saveLearnings(vfs, root, [
    { id: "old-1", text: "first", created_at: "2020-01-01T00:00:00.000Z" },
  ]);
  await save("second");
  await save("third");

  const items = await onDisk();
  expect(items.map((l) => l.text)).toEqual(["first", "second", "third"]);
  expect(items[0]).toEqual({
    id: "old-1",
    text: "first",
    created_at: "2020-01-01T00:00:00.000Z",
  });
});

test("two CONCURRENT saves both survive (the per-doc lock)", async () => {
  await saveLearnings(vfs, root, [
    { id: "old-1", text: "first", created_at: "2020-01-01T00:00:00.000Z" },
  ]);
  const [a, b] = await Promise.all([save("from chat A"), save("from chat B")]);
  expect([a.status, b.status]).toEqual([201, 201]);

  const items = await onDisk();
  expect(items.map((l) => l.text).sort()).toEqual([
    "first",
    "from chat A",
    "from chat B",
  ]);
});

test("a non-matching path or method is not handled", async () => {
  const { res } = fakeRes();
  const handled = await handleSandboxLearnings(
    { vault, store, vfs, paths },
    "GET",
    "/sandbox/learnings/save",
    new URL("http://host/sandbox/learnings/save"),
    fakeReq({}, {}),
    res,
  );
  expect(handled).toBe(false);
});

test("a save with no turn behind it is refused", async () => {
  const r = await save("nothing is running", { noLiveTurn: true });
  expect(r.status).toBe(400);
  expect(r.body).toMatchObject({ code: "not_in_turn" });
  expect(await onDisk()).toEqual([]);
});

test("a save naming no conversation at all is refused", async () => {
  const r = await save("nowhere", { conversationId: null });
  expect(r.status).toBe(400);
  expect(r.body).toMatchObject({ code: "not_in_turn" });
  expect(await onDisk()).toEqual([]);
});

test("a save naming a chat the host started no turn in is refused", async () => {
  liveTurns.start(agent.id, "conv-42", "execute");
  const r = await save("elsewhere", {
    conversationId: "conv-invented",
    noLiveTurn: true,
  });
  expect(r.status).toBe(400);
  expect(r.body).toMatchObject({ code: "not_in_turn" });
  expect(await onDisk()).toEqual([]);
});

test("plan mode writes nothing to memory", async () => {
  const r = await save("remember this", {
    conversationId: "conv-42",
    mode: "plan",
  });
  expect(r.status).toBe(403);
  expect(r.body).toMatchObject({ code: "plan_mode" });
  expect(await onDisk()).toEqual([]);
});

test("the learning is taught by the person the GATEWAY vouched for", async () => {
  const r = await save("Renewals are quarterly", {
    gatewayFronted: true,
    acting: actingHeader("u-felipe", "Felipe"),
    spoofedActing: actingHeader("u-mallory", "Mallory"),
    spoofedActingUser: "sub-mallory",
    conversationId: "conv-42",
  });
  expect(r.status).toBe(201);
  expect((await onDisk())[0]?.taught_by).toEqual({
    user_id: "u-felipe",
    name: "Felipe",
  });
});

test("a turn with no vouched identity cannot be given one by the runtime", async () => {
  const r = await save("who taught this", {
    gatewayFronted: true,
    spoofedActing: actingHeader("u-mallory", "Mallory"),
    spoofedActingUser: "sub-mallory",
    conversationId: "conv-42",
  });
  expect(r.status).toBe(201);
  expect((await onDisk())[0]).not.toHaveProperty("taught_by");
});
