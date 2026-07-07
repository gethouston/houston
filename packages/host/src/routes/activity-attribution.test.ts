import type { Server, ServerResponse } from "node:http";
import { docKey } from "@houston/domain";
import type { Activity, Capabilities } from "@houston/protocol";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { ProxyChannel } from "../channel/proxy";
import { MemoryCredentialStore } from "../credentials/store";
import type { RuntimeEndpoint, RuntimeLauncher, TokenVerifier } from "../ports";
import { type ControlPlaneDeps, createControlPlaneServer } from "../server";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";
import { stampTurnContributor } from "./activity-attribution";
import { workspaceRoot } from "./agent-data";

/**
 * Per-mission attribution (Teams): the acting human is stamped as a contributor
 * on activity create/PATCH and on the mission a user turn drives. Attribution
 * runs ONLY under a gateway-injected acting-as identity — off the gateway,
 * single-player activity.json stays byte-identical (no attribution keys).
 */

const verifier: TokenVerifier = {
  async verify(bearer) {
    return bearer.startsWith("tok:") ? { userId: bearer.slice(4) } : null;
  },
};
const launcher: RuntimeLauncher = {
  async ensureAwake(): Promise<RuntimeEndpoint> {
    return { baseUrl: "http://unused.local", token: "t" };
  },
  async sleep() {},
  async destroy() {},
  async status() {
    return "running";
  },
};
const store = new MemoryWorkspaceStore();
const credentials = new MemoryCredentialStore();
const vfs = new MemoryVfs();
const CAPS: Capabilities = {
  profile: "cloud",
  revealInOs: false,
  terminal: false,
  tunnel: false,
  codeExecution: "remote-sandbox",
  providers: ["openai-codex"],
  openaiCompatible: false,
  integrations: [],
};

// A turn POST (…/conversations/:cid/messages) reaches the channel; answer 202
// so the client's fetch resolves — the route already stamped attribution before
// dispatch, which is what these tests assert.
const deps = (): ControlPlaneDeps => ({
  verifier,
  store,
  credentials,
  vault: { sandboxToken: () => "x", validateSandboxToken: () => null },
  channels: {
    gke: new ProxyChannel({
      launcher,
      proxy: {
        async forward(_e, _r, res: ServerResponse) {
          res.writeHead(202, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        },
      },
      credentials,
      forwardActingHeader: true,
    }),
  },
  vfs,
  capabilities: CAPS,
});

/** A gateway-shaped acting-as token; the pod decodes the payload, never the sig. */
const actingToken = (sub: string, name?: string) =>
  `acting-v1.${Buffer.from(
    JSON.stringify({ sub, ...(name ? { name } : {}), exp: 4102444800 }),
  ).toString("base64url")}.sig`;

const auth = (who: string) => ({
  Authorization: `Bearer tok:${who}`,
  "Content-Type": "application/json",
});

let fronted: Server;
let frontedBase = "";
let agentId = "";
let root = "";

beforeAll(async () => {
  fronted = createControlPlaneServer({ ...deps(), gatewayFronted: true });
  await new Promise<void>((r) => fronted.listen(0, "127.0.0.1", () => r()));
  const addr = fronted.address();
  frontedBase = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;

  const created = await fetch(`${frontedBase}/agents`, {
    method: "POST",
    headers: auth("alice"),
    body: JSON.stringify({ name: "Helper" }),
  });
  agentId = ((await created.json()) as { id: string }).id;
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = (await store.listAgents(ws.id))[0];
  if (!agent) throw new Error("Expected an agent");
  root = workspaceRoot(ws, agent);
});

afterAll(async () => {
  await new Promise<void>((r) => fronted.close(() => r()));
});

/** Read the raw activity.json rows straight off the vfs. */
const rows = async (): Promise<Activity[]> => {
  const raw = await vfs.readText(docKey(root, "activity"));
  return raw ? (JSON.parse(raw) as Activity[]) : [];
};

test("POST create under an acting token stamps created_by + a contributor", async () => {
  const created = await fetch(`${frontedBase}/agents/${agentId}/activities`, {
    method: "POST",
    headers: {
      ...auth("alice"),
      "x-houston-acting-as": actingToken("supa-1", "Ada"),
    },
    body: JSON.stringify({ id: "act-create", title: "Ship it" }),
  });
  expect(created.status).toBe(201);
  const activity = (await created.json()) as Activity;
  expect(activity.created_by).toBe("supa-1");
  expect(activity.contributors).toEqual([{ user_id: "supa-1", name: "Ada" }]);
});

test("PATCH under a different acting token upserts a second contributor", async () => {
  const patched = await fetch(
    `${frontedBase}/agents/${agentId}/activities/act-create`,
    {
      method: "PATCH",
      headers: {
        ...auth("alice"),
        "x-houston-acting-as": actingToken("supa-2", "Grace"),
      },
      body: JSON.stringify({ status: "done" }),
    },
  );
  expect(patched.status).toBe(200);
  const next = (await patched.json()) as Activity;
  expect(next.status).toBe("done");
  // created_by is unchanged; the editor is appended as a contributor.
  expect(next.created_by).toBe("supa-1");
  expect(next.contributors).toEqual([
    { user_id: "supa-1", name: "Ada" },
    { user_id: "supa-2", name: "Grace" },
  ]);
});

test("a user turn stamps the acting human on the session_key-matched mission", async () => {
  await vfs.writeText(
    docKey(root, "activity"),
    JSON.stringify([
      {
        id: "m1",
        title: "By session key",
        description: "",
        status: "running",
        session_key: "conv-abc",
      },
    ]),
  );
  const turn = await fetch(
    `${frontedBase}/agents/${agentId}/conversations/conv-abc/messages`,
    {
      method: "POST",
      headers: {
        ...auth("alice"),
        "x-houston-acting-as": actingToken("supa-3", "Alan"),
      },
      body: JSON.stringify({ text: "hello" }),
    },
  );
  expect(turn.status).toBe(202);
  const m1 = (await rows()).find((a) => a.id === "m1");
  expect(m1?.contributors).toEqual([{ user_id: "supa-3", name: "Alan" }]);
});

test("a user turn falls back to the activity-<id> key when there is no session_key", async () => {
  await vfs.writeText(
    docKey(root, "activity"),
    JSON.stringify([
      { id: "m2", title: "By id fallback", description: "", status: "running" },
    ]),
  );
  const turn = await fetch(
    `${frontedBase}/agents/${agentId}/conversations/activity-m2/messages`,
    {
      method: "POST",
      headers: {
        ...auth("alice"),
        "x-houston-acting-as": actingToken("supa-4"),
      },
      body: JSON.stringify({ text: "hello" }),
    },
  );
  expect(turn.status).toBe(202);
  const m2 = (await rows()).find((a) => a.id === "m2");
  expect(m2?.contributors).toEqual([{ user_id: "supa-4" }]);
});

test("a malformed acting header stamps nothing and never errors the turn", async () => {
  await vfs.writeText(
    docKey(root, "activity"),
    JSON.stringify([
      {
        id: "m3",
        title: "Untouched",
        description: "",
        status: "running",
        session_key: "conv-bad",
      },
    ]),
  );
  const turn = await fetch(
    `${frontedBase}/agents/${agentId}/conversations/conv-bad/messages`,
    {
      method: "POST",
      headers: { ...auth("alice"), "x-houston-acting-as": "garbage" },
      body: JSON.stringify({ text: "hello" }),
    },
  );
  expect(turn.status).toBe(202);
  const m3 = (await rows()).find((a) => a.id === "m3");
  expect("contributors" in (m3 ?? {})).toBe(false);
});

test("off the gateway, an inbound acting header stamps NOTHING (byte-identical)", async () => {
  const plain = createControlPlaneServer(deps()); // not gatewayFronted
  await new Promise<void>((r) => plain.listen(0, "127.0.0.1", () => r()));
  const addr = plain.address();
  const b = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  try {
    const created = await fetch(`${b}/agents/${agentId}/activities`, {
      method: "POST",
      headers: {
        ...auth("alice"),
        "x-houston-acting-as": actingToken("mallory", "Mallory"),
      },
      body: JSON.stringify({ id: "act-plain", title: "Single-player" }),
    });
    expect(created.status).toBe(201);
    const activity = (await created.json()) as Activity;
    // No attribution keys at all — desktop/self-player output is unchanged.
    expect("created_by" in activity).toBe(false);
    expect("contributors" in activity).toBe(false);
  } finally {
    await new Promise<void>((r) => plain.close(() => r()));
  }
});

test("stampTurnContributor swallows a store failure — the turn is never broken", async () => {
  const spy = vi.spyOn(console, "error").mockImplementation(() => {});
  const throwing = {
    async readText(): Promise<string | null> {
      throw new Error("disk gone");
    },
    async writeText(): Promise<void> {},
  };
  await expect(
    stampTurnContributor(throwing, "root", "agent-x", "cid", {
      user_id: "supa-5",
    }),
  ).resolves.toBeUndefined();
  expect(spy).toHaveBeenCalledOnce();
  spy.mockRestore();
});
