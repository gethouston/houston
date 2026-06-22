import { test, expect, beforeAll, afterAll } from "bun:test";
import type { Server } from "node:http";
import type { Capabilities, HoustonEvent } from "@houston/protocol";
import { createControlPlaneServer, type ControlPlaneDeps } from "../server";
import { ProxyChannel } from "../channel/proxy";
import { BusEventHub } from "../events/hub";
import { MemoryTurnBus } from "../turn/bus";
import { MemoryWorkspaceStore } from "../store/memory";
import { MemoryCredentialStore } from "../credentials/store";
import { MemoryVfs } from "../vfs";
import type { RuntimeEndpoint, RuntimeLauncher, TokenVerifier } from "../ports";

/**
 * The global /v1/events SSE channel end to end: a mutation on the host emits a
 * HoustonEvent that arrives on the owner's stream — and NEVER on another
 * tenant's. This is the reactivity keystone the UI's query-invalidation map
 * rides on.
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
const CAPS: Capabilities = {
  profile: "cloud",
  revealInOs: false,
  terminal: false,
  tunnel: false,
  codeExecution: "remote-sandbox",
  providers: ["openai-codex"],
  integrations: [],
};

const store = new MemoryWorkspaceStore();
const credentials = new MemoryCredentialStore();
const vfs = new MemoryVfs();
const events = new BusEventHub(new MemoryTurnBus());

const deps = (over: Partial<ControlPlaneDeps> = {}): ControlPlaneDeps => ({
  verifier,
  store,
  credentials,
  vault: { sandboxToken: () => "x", validateSandboxToken: () => null },
  channels: {
    gke: new ProxyChannel({
      launcher,
      proxy: { async forward() {} },
      credentials,
    }),
  },
  vfs,
  events,
  capabilities: CAPS,
  ...over,
});

let server: Server;
let base = "";
let aliceAgentId = "";
const auth = (who: string) => ({
  Authorization: `Bearer tok:${who}`,
  "Content-Type": "application/json",
});

beforeAll(async () => {
  server = createControlPlaneServer(deps());
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  const created = await fetch(`${base}/agents`, {
    method: "POST",
    headers: auth("alice"),
    body: JSON.stringify({ name: "A" }),
  });
  aliceAgentId = ((await created.json()) as { id: string }).id;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

/**
 * Open an SSE stream and resolve with the FIRST `data:` HoustonEvent that
 * arrives (or reject on timeout). Aborts the request on settle so the server
 * unsubscribes. `onConnected` fires once the comment preamble is seen, so the
 * caller can trigger the mutation only after the subscription is live.
 */
async function firstEvent(
  who: string,
  onConnected: () => Promise<void>,
  timeoutMs = 2000,
): Promise<HoustonEvent | "timeout"> {
  const ac = new AbortController();
  const res = await fetch(`${base}/v1/events`, {
    headers: { Authorization: `Bearer tok:${who}` },
    signal: ac.signal,
  });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("text/event-stream");
  if (!res.body)
    throw new Error("Expected a readable body from the SSE response");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  let connected = false;
  let buffer = "";
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return "timeout";
      buffer += decoder.decode(value, { stream: true });
      if (!connected && buffer.includes(": connected")) {
        connected = true;
        await onConnected();
      }
      for (const frame of buffer.split("\n\n")) {
        const line = frame.split("\n").find((l) => l.startsWith("data: "));
        if (line)
          return JSON.parse(line.slice("data: ".length)) as HoustonEvent;
      }
    }
  } catch {
    return "timeout";
  } finally {
    clearTimeout(timer);
    ac.abort();
  }
}

test("a host mutation emits its event onto the owner's stream", async () => {
  const event = await firstEvent("alice", async () => {
    await fetch(`${base}/agents/${aliceAgentId}/activities`, {
      method: "POST",
      headers: auth("alice"),
      body: JSON.stringify({ title: "Build the deck" }),
    });
  });
  expect(event).toEqual({ type: "ActivityChanged", agentPath: aliceAgentId });
});

test("skill changes emit SkillsChanged on the stream", async () => {
  const event = await firstEvent("alice", async () => {
    await fetch(`${base}/agents/${aliceAgentId}/skills`, {
      method: "POST",
      headers: auth("alice"),
      body: JSON.stringify({
        name: "Do Thing",
        description: "d",
        content: "## Procedure\nx",
      }),
    });
  });
  expect(event).toEqual({ type: "SkillsChanged", agentPath: aliceAgentId });
});

test("another tenant's stream never sees alice's events", async () => {
  // Bob listens; alice mutates. Bob must time out (no cross-tenant leak).
  const bobResult = await firstEvent(
    "bob",
    async () => {
      await fetch(`${base}/agents/${aliceAgentId}/activities`, {
        method: "POST",
        headers: auth("alice"),
        body: JSON.stringify({ title: "Secret" }),
      });
    },
    800,
  );
  expect(bobResult).toBe("timeout");
});

test("/v1/events 503s when no event hub is wired", async () => {
  const noEvents = createControlPlaneServer(deps({ events: undefined }));
  await new Promise<void>((r) => noEvents.listen(0, "127.0.0.1", () => r()));
  const addr = noEvents.address();
  const b = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  try {
    const r = await fetch(`${b}/v1/events`, {
      headers: { Authorization: "Bearer tok:alice" },
    });
    expect(r.status).toBe(503);
    await r.text();
  } finally {
    await new Promise<void>((r) => noEvents.close(() => r()));
  }
});

test("/v1/events requires auth", async () => {
  const r = await fetch(`${base}/v1/events`);
  expect(r.status).toBe(401);
  await r.text();
});
