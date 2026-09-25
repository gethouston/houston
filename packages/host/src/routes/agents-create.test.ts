import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { Capabilities } from "@houston/protocol";
import { beforeEach, expect, test } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import type { Agent } from "../domain/types";
import type { ControlPlaneDeps } from "../server";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";
import { DEFAULT_PATHS } from "./agent-authz";
import { dispatchGroup } from "./registry/all";

/**
 * POST /agents create + seed. The create is atomic-enough: when the seed write
 * fails, the just-created agent record + folder are rolled back so a retry (the
 * onboarding path reuses an existing record) recreates cleanly instead of
 * reusing a permanently seedless agent.
 */

const CAPS: Capabilities = {
  profile: "cloud",
  revealInOs: false,
  terminal: false,
  tunnel: false,
  codeExecution: "remote-sandbox",
  providers: ["openai-codex"],
  openaiCompatible: false,
  integrations: [],
  sharedSkills: false,
};

let store: MemoryWorkspaceStore;
let vfs: MemoryVfs;
let deps: ControlPlaneDeps;

beforeEach(() => {
  store = new MemoryWorkspaceStore();
  vfs = new MemoryVfs();
  deps = {
    verifier: {
      async verify() {
        return null;
      },
    },
    store,
    credentials: new MemoryCredentialStore(),
    vault: { sandboxToken: () => "x", validateSandboxToken: () => null },
    channels: {},
    vfs,
    capabilities: CAPS,
  } satisfies ControlPlaneDeps;
});

function req(body: string): IncomingMessage {
  const stream = Readable.from([Buffer.from(body, "utf8")]);
  return Object.assign(stream, {
    headers: { "content-type": "application/json" },
  }) as IncomingMessage;
}

function res() {
  const out = {
    status: 0,
    body: "",
    writeHead(status: number) {
      this.status = status;
      return this;
    },
    end(chunk?: unknown) {
      this.body = chunk ? String(chunk) : "";
      return this;
    },
  };
  return out as unknown as ServerResponse & typeof out;
}

async function post(body: unknown) {
  const path = "/agents";
  const url = new URL(path, "http://host.local");
  return dispatchGroup("agents", {
    deps,
    userId: "alice",
    method: "POST",
    path: "/agents",
    url,
    req: req(JSON.stringify(body)),
    res: res(),
  });
}

test("a healthy create seeds the agent and keeps the record", async () => {
  const response = res();
  const url = new URL("/agents", "http://host.local");
  const handled = await dispatchGroup("agents", {
    deps,
    userId: "alice",
    method: "POST",
    path: "/agents",
    url,
    req: req(JSON.stringify({ name: "Helper", seeds: { "notes.json": "[]" } })),
    res: response,
  });
  expect(handled).toBe(true);
  expect(response.status).toBe(201);

  const ws = await store.getOrCreatePersonalWorkspace("alice");
  const agents = await store.listAgents(ws.id);
  expect(agents).toHaveLength(1);
  const root = DEFAULT_PATHS.agentRoot(ws, agents[0] as Agent);
  expect(await vfs.readText(`${root}/notes.json`)).toBe("[]");
});

test("a failed seed write rolls back the agent record and its folder", async () => {
  // Capture the record the route creates so we can prove it was rolled back.
  const created: Agent[] = [];
  const orig = store.createAgent.bind(store);
  store.createAgent = async (input) => {
    const a = await orig(input);
    created.push(a);
    return a;
  };

  // A seed with a traversal key makes writeAgentSeeds throw mid-write, after a
  // valid earlier seed + the schema files have already landed on disk.
  await expect(
    post({ name: "Seedling", seeds: { "notes.json": "[]", "../evil": "x" } }),
  ).rejects.toThrow(/unsafe seed path/);

  expect(created).toHaveLength(1);
  const rolledBack = created[0] as Agent;

  const ws = await store.getOrCreatePersonalWorkspace("alice");
  // Record gone → the onboarding retry (list-then-reuse) sees no assistant and
  // recreates cleanly.
  expect(await store.getAgent(rolledBack.id)).toBeNull();
  expect(await store.listAgents(ws.id)).toEqual([]);
  // Folder gone → no half-written schema/seed files linger.
  const root = DEFAULT_PATHS.agentRoot(ws, rolledBack);
  expect(await vfs.list(root)).toEqual([]);
});

test("an invalid name answers 400 with a clean message, not a 500 (HOU-1166)", async () => {
  for (const bad of [
    "hello/",
    "back\\slash",
    "a..b",
    ".hidden",
    "x".repeat(65),
  ]) {
    const response = res();
    const handled = await dispatchGroup("agents", {
      deps,
      userId: "alice",
      method: "POST",
      path: "/agents",
      url: new URL("/agents", "http://host.local"),
      req: req(JSON.stringify({ name: bad })),
      res: response,
    });
    expect(handled).toBe(true);
    expect(response.status).toBe(400);
    expect(String(JSON.parse(response.body).error)).toMatch(/agent name/);
  }
  const ws = await store.getOrCreatePersonalWorkspace("alice");
  expect(await store.listAgents(ws.id)).toEqual([]);
});

test("create trims the submitted name before storing it", async () => {
  const response = res();
  await dispatchGroup("agents", {
    deps,
    userId: "alice",
    method: "POST",
    path: "/agents",
    url: new URL("/agents", "http://host.local"),
    req: req(JSON.stringify({ name: "  Padded  " })),
    res: response,
  });
  expect(response.status).toBe(201);
  expect(JSON.parse(response.body).name).toBe("Padded");
});

async function list(): Promise<Array<{ name: string; role?: string }>> {
  const response = res();
  await dispatchGroup("agents", {
    deps,
    userId: "alice",
    method: "GET",
    path: "/agents",
    url: new URL("/agents", "http://host.local"),
    req: req(""),
    res: response,
  });
  expect(response.status).toBe(200);
  return JSON.parse(response.body);
}

test("the listing names the role each job description names, and nothing where none is named", async () => {
  await post({
    name: "Coder",
    claudeMd:
      "---\nindustry: Healthcare\nrole: '  Medical\u200b   coder '\n---\n\nCharts.",
  });
  await post({ name: "Plain", claudeMd: "# Notes\n\nJust notes." });
  await post({ name: "Bare" });

  const byName = Object.fromEntries((await list()).map((a) => [a.name, a]));
  expect(byName.Coder?.role).toBe("Medical coder");
  expect(byName.Plain).not.toHaveProperty("role");
  expect(byName.Bare).not.toHaveProperty("role");
});
