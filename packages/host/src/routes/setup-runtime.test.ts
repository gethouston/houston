import type { Server } from "node:http";
import type { Capabilities, CustomEndpoint } from "@houston/protocol";
import { expect, test } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import { EnvCredentialVault } from "../credentials/vault";
import type {
  CaptureResult,
  ChannelCtx,
  RuntimeChannel,
  TokenVerifier,
  TurnPin,
} from "../ports";
import { type ControlPlaneDeps, createControlPlaneServer } from "../server";
import { MemoryWorkspaceStore } from "../store/memory";

/**
 * The pre-agent provider-connect surface (`/setup-runtime/*`) over real HTTP:
 * first-run onboarding connects the user's AI BEFORE any agent exists, so the
 * host runs the login in a hidden setup runtime scoped to the personal
 * workspace. Verifies the synthetic-agent shape (capture lands on the REAL
 * workspace id), the strict allowlist (no chat/export surface pre-agent), and
 * the capture/api-key mirrors of the per-agent routes.
 */

const USER = "alice";
const CAPS: Capabilities = {
  profile: "cloud",
  revealInOs: false,
  terminal: false,
  tunnel: false,
  codeExecution: "remote-sandbox",
  providers: ["openai-codex"],
  openaiCompatible: false,
  integrations: ["composio"],
};

/** Records every call; dispatch answers 200 with the rest it was asked for. */
class FakeChannel implements RuntimeChannel {
  dispatched: { ctx: ChannelCtx; method: string; rest: string }[] = [];
  captured: { ctx: ChannelCtx; provider?: string }[] = [];
  apiKeys: { ctx: ChannelCtx; provider: string; apiKey: string }[] = [];
  captureResult: CaptureResult = { ok: true, provider: "openai-codex" };

  async dispatch(
    ctx: ChannelCtx,
    method: string,
    rest: string,
    _url: URL,
    _req: unknown,
    res: import("node:http").ServerResponse,
  ): Promise<void> {
    this.dispatched.push({ ctx, method, rest });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ rest }));
  }
  async fireTurn(
    _ctx: ChannelCtx,
    _c: string,
    _t: string,
    _p?: TurnPin,
  ): Promise<void> {}
  async cancelTurn(): Promise<boolean> {
    return false;
  }
  async teardown(): Promise<void> {}
  async captureCredential(
    ctx: ChannelCtx,
    provider?: string,
  ): Promise<CaptureResult> {
    this.captured.push({ ctx, provider });
    return this.captureResult;
  }
  async saveApiKeyCredential(
    ctx: ChannelCtx,
    provider: string,
    apiKey: string,
  ): Promise<void> {
    this.apiKeys.push({ ctx, provider, apiKey });
  }
  async saveCustomEndpoint(
    _ctx: ChannelCtx,
    _e: CustomEndpoint,
  ): Promise<void> {}
  async forgetCredential(): Promise<void> {}
}

async function setup(opts: { withChannel?: boolean } = {}) {
  const verifier: TokenVerifier = {
    async verify(b) {
      return b === "tok" ? { userId: USER } : null;
    },
  };
  const store = new MemoryWorkspaceStore({ defaultRuntime: "gke" });
  const channel = new FakeChannel();
  const deps: ControlPlaneDeps = {
    verifier,
    store,
    credentials: new MemoryCredentialStore(),
    vault: new EnvCredentialVault({ secret: "test-secret" }),
    channels: opts.withChannel === false ? {} : { gke: channel },
    capabilities: CAPS,
    corsOrigin: "*",
  };
  const server: Server = createControlPlaneServer(deps);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const addr = server.address();
  const base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  const ws = await store.getOrCreatePersonalWorkspace(USER);
  return { base, ws, channel, stop: () => server.close() };
}

const auth = {
  Authorization: "Bearer tok",
  "Content-Type": "application/json",
};

test("login + status dispatch to a hidden setup agent on the PERSONAL workspace", async () => {
  const { base, ws, channel, stop } = await setup();
  try {
    for (const [method, path] of [
      ["POST", "auth/openai-codex/login?deviceAuth=false"],
      ["POST", "auth/openai-codex/login/complete"],
      // The reconnect card's every press goes cancel → launch, so a blocked
      // cancel 404s and the login never launches (HOU-676).
      ["POST", "auth/openai-codex/login/cancel"],
      ["GET", "auth/status"],
      ["GET", "providers"],
    ] as const) {
      const res = await fetch(`${base}/setup-runtime/${path}`, {
        method,
        headers: auth,
      });
      expect(res.status).toBe(200);
    }
    expect(channel.dispatched.map((d) => d.rest)).toEqual([
      "auth/openai-codex/login",
      "auth/openai-codex/login/complete",
      "auth/openai-codex/login/cancel",
      "auth/status",
      "providers",
    ]);
    for (const d of channel.dispatched) {
      // Capture scope: the credential must land where every REAL agent's
      // connect-once serve reads it — the user's personal workspace.
      expect(d.ctx.agent.workspaceId).toBe(ws.id);
      expect(d.ctx.workspace.id).toBe(ws.id);
      // Hidden: a dot-directory name the FS store never lists as an agent.
      expect(d.ctx.agent.name.startsWith(".")).toBe(true);
    }
  } finally {
    stop();
  }
});

test("everything outside the connect surface is 404 — chat and auth/export never reach the runtime", async () => {
  const { base, channel, stop } = await setup();
  try {
    for (const [method, path] of [
      ["GET", "auth/export"], // would hand a refresh token to a client
      ["POST", "auth/export"],
      ["POST", "conversations/x/messages"],
      ["POST", "settings"],
      ["GET", ""],
    ] as const) {
      const res = await fetch(`${base}/setup-runtime/${path}`, {
        method,
        headers: auth,
      });
      expect(res.status).toBe(404);
    }
    expect(channel.dispatched).toEqual([]);
  } finally {
    stop();
  }
});

test("credential/capture mirrors the per-agent capture (provider passthrough + error mapping)", async () => {
  const { base, ws, channel, stop } = await setup();
  try {
    let res = await fetch(`${base}/setup-runtime/credential/capture`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ provider: "openai-codex" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, provider: "openai-codex" });
    expect(channel.captured).toHaveLength(1);
    expect(channel.captured[0]?.provider).toBe("openai-codex");
    expect(channel.captured[0]?.ctx.agent.workspaceId).toBe(ws.id);

    channel.captureResult = {
      ok: false,
      status: 400,
      error: "agent is not connected yet",
    };
    res = await fetch(`${base}/setup-runtime/credential/capture`, {
      method: "POST",
      headers: auth,
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "agent is not connected yet" });
  } finally {
    stop();
  }
});

test("credential/api-key stores through the channel and validates its body", async () => {
  const { base, ws, channel, stop } = await setup();
  try {
    const ok = await fetch(`${base}/setup-runtime/credential/api-key`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ provider: "opencode", apiKey: "sk-test" }),
    });
    expect(ok.status).toBe(200);
    expect(channel.apiKeys).toEqual([
      {
        ctx: expect.objectContaining({
          agent: expect.objectContaining({ workspaceId: ws.id }),
        }),
        provider: "opencode",
        apiKey: "sk-test",
      },
    ]);

    const missing = await fetch(`${base}/setup-runtime/credential/api-key`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ provider: "opencode" }),
    });
    expect(missing.status).toBe(400);
  } finally {
    stop();
  }
});

test("401 without a valid bearer; 503 when the workspace runtime has no channel", async () => {
  const { base, stop } = await setup({ withChannel: false });
  try {
    const noAuth = await fetch(`${base}/setup-runtime/providers`);
    expect(noAuth.status).toBe(401);

    const noChannel = await fetch(`${base}/setup-runtime/providers`, {
      headers: auth,
    });
    expect(noChannel.status).toBe(503);
  } finally {
    stop();
  }
});
