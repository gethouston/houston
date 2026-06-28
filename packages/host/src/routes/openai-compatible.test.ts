import type { Server } from "node:http";
import type { Capabilities, CustomEndpoint } from "@houston/protocol";
import { afterEach, expect, test } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import type { ChannelCtx, RuntimeChannel, TokenVerifier } from "../ports";
import { type ControlPlaneDeps, createControlPlaneServer } from "../server";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryVfs } from "../vfs";

/**
 * POST /agents/:id/provider/openai-compatible — connect a local OpenAI-compatible
 * server (Ollama / vLLM / LM Studio). Pins the route's guarantees: it is the hard
 * cloud gate (refuses unless the deployment's `openaiCompatible` capability is on,
 * before reaching the channel), validates the base URL at the boundary, forwards
 * a valid endpoint to the channel, surfaces a channel failure as 502, and is
 * ownership-walled.
 */

const verifier: TokenVerifier = {
  async verify(bearer) {
    return bearer.startsWith("tok:") ? { userId: bearer.slice(4) } : null;
  },
};

class SpyChannel implements RuntimeChannel {
  saved: CustomEndpoint[] = [];
  throwMessage: string | null = null;
  async dispatch() {}
  async fireTurn() {}
  async teardown() {}
  async captureCredential() {
    return { ok: true as const, provider: "openai-codex" };
  }
  async forgetCredential() {}
  async saveApiKeyCredential() {}
  async saveCustomEndpoint(_ctx: ChannelCtx, endpoint: CustomEndpoint) {
    this.saved.push(endpoint);
    if (this.throwMessage) throw new Error(this.throwMessage);
  }
}

const baseCaps: Omit<Capabilities, "profile" | "openaiCompatible"> = {
  revealInOs: false,
  terminal: false,
  tunnel: false,
  codeExecution: "remote-sandbox",
  providers: ["openai-codex"],
  integrations: [],
};
const LOCAL_CAPS: Capabilities = {
  ...baseCaps,
  profile: "local",
  openaiCompatible: true,
};
const CLOUD_CAPS: Capabilities = {
  ...baseCaps,
  profile: "cloud",
  openaiCompatible: false,
};

const auth = (who: string) => ({
  Authorization: `Bearer tok:${who}`,
  "Content-Type": "application/json",
});

let server: Server | null = null;

async function setup(capabilities: Capabilities): Promise<{
  base: string;
  agentId: string;
  channel: SpyChannel;
}> {
  const store = new MemoryWorkspaceStore();
  const channel = new SpyChannel();
  const deps: ControlPlaneDeps = {
    verifier,
    store,
    credentials: new MemoryCredentialStore(),
    vault: { sandboxToken: () => "x", validateSandboxToken: () => null },
    channels: { gke: channel },
    vfs: new MemoryVfs(),
    capabilities,
  };
  server = createControlPlaneServer(deps);
  await new Promise<void>((r) => server?.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  const base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  const created = await fetch(`${base}/agents`, {
    method: "POST",
    headers: auth("alice"),
    body: JSON.stringify({ name: "Helper" }),
  });
  const agentId = ((await created.json()) as { id: string }).id;
  return { base, agentId, channel };
}

const connect = (base: string, agentId: string, body: unknown, who = "alice") =>
  fetch(`${base}/agents/${agentId}/provider/openai-compatible`, {
    method: "POST",
    headers: auth(who),
    body: JSON.stringify(body),
  });

afterEach(async () => {
  if (server) await new Promise<void>((r) => server?.close(() => r()));
  server = null;
});

test("local deployment forwards the endpoint to the channel and 200s", async () => {
  const { base, agentId, channel } = await setup(LOCAL_CAPS);
  const res = await connect(base, agentId, {
    baseUrl: "http://localhost:11434/v1",
    model: "llama3.1",
    name: "Llama",
  });
  expect(res.status).toBe(200);
  expect(channel.saved).toHaveLength(1);
  expect(channel.saved[0]).toMatchObject({
    baseUrl: "http://localhost:11434/v1",
    model: "llama3.1",
    name: "Llama",
  });
});

test("cloud deployment refuses (400) before reaching the channel — the hard gate", async () => {
  const { base, agentId, channel } = await setup(CLOUD_CAPS);
  const res = await connect(base, agentId, {
    baseUrl: "http://localhost:11434/v1",
    model: "llama3.1",
  });
  expect(res.status).toBe(400);
  // Never forwarded: a cloud runtime/pod can't reach the user's localhost.
  expect(channel.saved).toHaveLength(0);
});

test("missing baseUrl or model 400s", async () => {
  const { base, agentId, channel } = await setup(LOCAL_CAPS);
  expect((await connect(base, agentId, { model: "m" })).status).toBe(400);
  expect(
    (await connect(base, agentId, { baseUrl: "http://x/v1" })).status,
  ).toBe(400);
  expect(channel.saved).toHaveLength(0);
});

test("a non-http(s) base URL is rejected at the boundary (400), never forwarded", async () => {
  const { base, agentId, channel } = await setup(LOCAL_CAPS);
  expect(
    (
      await connect(base, agentId, {
        baseUrl: "file:///etc/passwd",
        model: "m",
      })
    ).status,
  ).toBe(400);
  expect(
    (await connect(base, agentId, { baseUrl: "not a url", model: "m" })).status,
  ).toBe(400);
  expect(channel.saved).toHaveLength(0);
});

test("a channel failure surfaces as 502 (never a silent miss)", async () => {
  const { base, agentId, channel } = await setup(LOCAL_CAPS);
  channel.throwMessage = "runtime did not accept it";
  const res = await connect(base, agentId, {
    baseUrl: "http://localhost:11434/v1",
    model: "llama3.1",
  });
  expect(res.status).toBe(502);
  expect(((await res.json()) as { error: string }).error).toContain(
    "runtime did not accept it",
  );
});

test("another user cannot connect the agent's local model (403)", async () => {
  const { base, agentId, channel } = await setup(LOCAL_CAPS);
  const res = await connect(
    base,
    agentId,
    { baseUrl: "http://localhost:11434/v1", model: "llama3.1" },
    "bob",
  );
  expect(res.status).toBe(403);
  expect(channel.saved).toHaveLength(0);
});
