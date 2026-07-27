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

/**
 * The runtime-facing memory save route: merge-safe, and the ONLY writer that
 * records a learning's provenance.
 *
 * The invariants under test:
 *  - Gateway-fronted: the acting-as header names the person (`taught_by`), and
 *    with no acting-as token (a fired routine) the creator's `acting-user` sub
 *    does — the same ladder the integrations sandbox route walks.
 *  - Off the gateway: NO identity key at all, even with a header present — an
 *    inbound acting header is untrusted client input on the desktop, and a
 *    single-player learnings.json must stay free of identity keys.
 *  - The mission is matched by the SAME convention per-mission attribution
 *    uses: `session_key === cid`, with `activity-<id>` as the fallback. It is
 *    stamped on every deployment (a mission is not an identity).
 *  - The write MERGES: existing learnings survive, even when two saves run
 *    concurrently (the load→append→save runs under the per-doc lock).
 */

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

/** `acting-v1.<payloadB64Url>.<sig>` — what the gateway stamps on a proxied request. */
function actingHeader(sub: string, name?: string): string {
  const payload = Buffer.from(JSON.stringify({ sub, name })).toString(
    "base64url",
  );
  return `acting-v1.${payload}.sig`;
}

/** A fake IncomingMessage: an async byte stream carrying the JSON body. */
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

/** A fake ServerResponse capturing the status + JSON body `json()` writes. */
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
    /** The routine creator's sub, as a fired routine's turn forwards it. */
    actingUser?: string;
    conversationId?: string;
    token?: string;
  } = {},
) {
  const headers: Record<string, string> = {
    authorization: `Bearer ${opts.token ?? "sb-good"}`,
  };
  if (opts.acting) headers["x-houston-acting-as"] = opts.acting;
  if (opts.actingUser) headers["x-houston-acting-user"] = opts.actingUser;
  if (opts.conversationId)
    headers[CONVERSATION_ID_HEADER] = opts.conversationId;
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

/** The learnings file as it is on disk after a save. */
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
  // A FIRED ROUTINE has no driving human, so there is no acting-as token — the
  // runtime forwards the routine creator's sub instead. Without this rung a
  // routine-taught learning would be anonymous in hosted Teams.
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
  // The mission IS stamped off the gateway: it is not an identity, and it is
  // the useful half of provenance for a single-player user.
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

test("no conversation id and no match stamp no mission keys", async () => {
  await save("no cid");
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
  // The pre-existing entry is untouched, keys and all.
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
  // Two conversations on the same pod saving at once. Without the lock both
  // load the same base list and the second write drops the first's entry.
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
