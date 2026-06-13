import { test, expect, beforeAll, afterAll } from "bun:test";
import type { Server } from "node:http";
import type { Capabilities, Activity, Routine } from "@houston/protocol";
import { docKey } from "@houston/domain";
import { createControlPlaneServer, type ControlPlaneDeps } from "../server";
import { ProxyChannel } from "../channel/proxy";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryCredentialStore } from "../credentials/store";
import { MemoryVfs } from "../vfs";
import type { RuntimeEndpoint, RuntimeLauncher, TokenVerifier } from "../ports";
import { workspaceRoot } from "./agent-data";

/**
 * The typed .houston families served by the HOST off the workspace vfs — the
 * P3 slice that un-fakes the web adapter's localStorage stubs. Covers: CRUD
 * lifecycles, schema seeding on agent create, ownership wall, agent-written
 * junk surfacing as diagnostics, and 503 when no vfs is wired.
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
};

const deps = (): ControlPlaneDeps => ({
  verifier,
  store,
  credentials,
  vault: { sandboxToken: () => "x", validateSandboxToken: () => null },
  channels: { gke: new ProxyChannel({ launcher, proxy: { async forward() {} }, credentials }) },
  vfs,
  capabilities: CAPS,
});

let server: Server;
let base = "";
let agentId = "";
const auth = (who: string) => ({ Authorization: `Bearer tok:${who}`, "Content-Type": "application/json" });

beforeAll(async () => {
  server = createControlPlaneServer(deps());
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;

  const created = await fetch(`${base}/agents`, {
    method: "POST",
    headers: auth("alice"),
    body: JSON.stringify({ name: "Helper" }),
  });
  agentId = ((await created.json()) as { id: string }).id;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

test("agent creation seeds the .houston schemas into the workspace", async () => {
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = (await store.listAgents(ws.id))[0]!;
  const root = workspaceRoot(ws, agent);
  const keys = await vfs.list(root);
  expect(keys).toContain(`${root}/.houston/activity/activity.schema.json`);
  expect(keys).toContain(`${root}/.houston/routines/routines.schema.json`);
});

test("activities: full CRUD lifecycle over the host", async () => {
  const created = await fetch(`${base}/agents/${agentId}/activities`, {
    method: "POST",
    headers: auth("alice"),
    body: JSON.stringify({ title: "Build the Q2 deck", description: "10 slides" }),
  });
  expect(created.status).toBe(201);
  const activity = (await created.json()) as Activity;
  expect(activity.status).toBe("running");

  const patched = await fetch(`${base}/agents/${agentId}/activities/${activity.id}`, {
    method: "PATCH",
    headers: auth("alice"),
    body: JSON.stringify({ status: "done" }),
  });
  expect(patched.status).toBe(200);
  expect(((await patched.json()) as Activity).status).toBe("done");

  const list = await fetch(`${base}/agents/${agentId}/activities`, { headers: auth("alice") });
  const body = (await list.json()) as { items: Activity[]; diagnostics: unknown[] };
  expect(body.items.map((a) => a.title)).toEqual(["Build the Q2 deck"]);

  const deleted = await fetch(`${base}/agents/${agentId}/activities/${activity.id}`, {
    method: "DELETE",
    headers: auth("alice"),
  });
  expect(deleted.status).toBe(200);
  expect(
    (await fetch(`${base}/agents/${agentId}/activities/${activity.id}`, { method: "PATCH", headers: auth("alice"), body: "{}" })).status,
  ).toBe(404);
});

test("routines: created with schema defaults; timezone clears with null", async () => {
  const created = await fetch(`${base}/agents/${agentId}/routines`, {
    method: "POST",
    headers: auth("alice"),
    body: JSON.stringify({ name: "Daily report", prompt: "Write it", schedule: "0 9 * * 1-5", timezone: "America/Bogota" }),
  });
  expect(created.status).toBe(201);
  const routine = (await created.json()) as Routine;
  expect(routine.enabled).toBe(true);
  expect(routine.chat_mode).toBe("shared");

  const cleared = await fetch(`${base}/agents/${agentId}/routines/${routine.id}`, {
    method: "PATCH",
    headers: auth("alice"),
    body: JSON.stringify({ timezone: null }),
  });
  expect(((await cleared.json()) as Routine).timezone).toBeNull();

  const runs = await fetch(`${base}/agents/${agentId}/routine_runs`, { headers: auth("alice") });
  expect(((await runs.json()) as { items: unknown[] }).items).toEqual([]);
});

test("config: PUT replaces, GET reads back", async () => {
  const put = await fetch(`${base}/agents/${agentId}/config`, {
    method: "PUT",
    headers: auth("alice"),
    body: JSON.stringify({ provider: "openai-codex", model: "gpt-5.5" }),
  });
  expect(put.status).toBe(200);
  const got = await fetch(`${base}/agents/${agentId}/config`, { headers: auth("alice") });
  expect(((await got.json()) as { config: { model: string } }).config.model).toBe("gpt-5.5");
});

test("agent-written junk in activity.json drops bad entries AND surfaces diagnostics", async () => {
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agent = (await store.listAgents(ws.id))[0]!;
  await vfs.writeText(
    docKey(workspaceRoot(ws, agent), "activity"),
    JSON.stringify([{ id: "ok", title: "Good", description: "", status: "done" }, { broken: true }]),
  );
  const r = await fetch(`${base}/agents/${agentId}/activities`, { headers: auth("alice") });
  const body = (await r.json()) as { items: Activity[]; diagnostics: { message: string }[] };
  expect(body.items.map((a) => a.id)).toEqual(["ok"]);
  expect(body.diagnostics).toHaveLength(1);
  expect(body.diagnostics[0]!.message).toContain("malformed");
});

test("another user is walled off from the data families (403)", async () => {
  const r = await fetch(`${base}/agents/${agentId}/activities`, { headers: auth("bob") });
  expect(r.status).toBe(403);
});

test("skills: create → list → read → edit → delete, full lifecycle over the host", async () => {
  const created = await fetch(`${base}/agents/${agentId}/skills`, {
    method: "POST",
    headers: auth("alice"),
    body: JSON.stringify({
      name: "Summarize Inbox",
      description: "Summarize unread email",
      content: "## Procedure\nDo the thing.",
    }),
  });
  expect(created.status).toBe(201);
  const detail = (await created.json()) as { name: string; content: string };
  expect(detail.name).toBe("summarize-inbox");
  expect(detail.content).toContain("## Procedure");

  // Duplicate create → 409, never a silent overwrite.
  const dup = await fetch(`${base}/agents/${agentId}/skills`, {
    method: "POST",
    headers: auth("alice"),
    body: JSON.stringify({ name: "Summarize Inbox", description: "d", content: "c" }),
  });
  expect(dup.status).toBe(409);

  const list = await fetch(`${base}/agents/${agentId}/skills`, { headers: auth("alice") });
  const skills = (await list.json()) as { items: { name: string; featured: boolean }[] };
  expect(skills.items.map((s) => s.name)).toContain("summarize-inbox");

  const put = await fetch(`${base}/agents/${agentId}/skills/summarize-inbox`, {
    method: "PUT",
    headers: auth("alice"),
    body: JSON.stringify({ content: "---\nname: summarize-inbox\ndescription: v2\nversion: 2\n---\n\nNew body.\n" }),
  });
  expect(put.status).toBe(200);
  const read = await fetch(`${base}/agents/${agentId}/skills/summarize-inbox`, { headers: auth("alice") });
  expect(((await read.json()) as { version: number }).version).toBe(2);

  const del = await fetch(`${base}/agents/${agentId}/skills/summarize-inbox`, {
    method: "DELETE",
    headers: auth("alice"),
  });
  expect(del.status).toBe(200);
  expect((await fetch(`${base}/agents/${agentId}/skills/summarize-inbox`, { headers: auth("alice") })).status).toBe(404);
});

test("skills are walled off across users (403) like every agent surface", async () => {
  expect((await fetch(`${base}/agents/${agentId}/skills`, { headers: auth("bob") })).status).toBe(403);
});

test("no vfs wired → typed data routes answer 503, runtime dispatch unaffected", async () => {
  const noVfs = createControlPlaneServer({ ...deps(), vfs: undefined });
  await new Promise<void>((r) => noVfs.listen(0, "127.0.0.1", () => r()));
  const addr = noVfs.address();
  const b = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  try {
    const r = await fetch(`${b}/agents/${agentId}/activities`, { headers: auth("alice") });
    expect(r.status).toBe(503);
  } finally {
    await new Promise<void>((r) => noVfs.close(() => r()));
  }
});
