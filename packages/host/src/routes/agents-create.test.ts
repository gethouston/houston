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
import { handleAgents } from "./agents";

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
  return handleAgents(
    deps,
    "alice",
    "POST",
    path,
    url,
    req(JSON.stringify(body)),
    res(),
  );
}

test("a healthy create seeds the agent and keeps the record", async () => {
  const response = res();
  const url = new URL("/agents", "http://host.local");
  const handled = await handleAgents(
    deps,
    "alice",
    "POST",
    "/agents",
    url,
    req(JSON.stringify({ name: "Helper", seeds: { "notes.json": "[]" } })),
    response,
  );
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
