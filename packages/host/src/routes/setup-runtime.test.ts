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
  sharedSkills: false,
};

class FakeChannel implements RuntimeChannel {
  dispatched: { ctx: ChannelCtx; method: string; rest: string }[] = [];
  captured: { ctx: ChannelCtx; provider?: string }[] = [];
  apiKeys: { ctx: ChannelCtx; provider: string; apiKey: string }[] = [];
  claudeOAuth: { ctx: ChannelCtx; accessToken: string }[] = [];
  forgotten: { ctx: ChannelCtx; provider: string }[] = [];
  claudeOAuthError: Error | null = null;
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
  async busy(): Promise<boolean> {
    return false;
  }
  async runtimeStatus() {
    return "running" as const;
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
  async saveClaudeOAuthCredential(
    ctx: ChannelCtx,
    cred: { accessToken: string },
  ): Promise<void> {
    if (this.claudeOAuthError) throw this.claudeOAuthError;
    this.claudeOAuth.push({ ctx, accessToken: cred.accessToken });
  }
  async forgetCredential(ctx: ChannelCtx, provider: string): Promise<void> {
    this.forgotten.push({ ctx, provider });
  }
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
      expect(d.ctx.agent.workspaceId).toBe(ws.id);
      expect(d.ctx.workspace.id).toBe(ws.id);
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
      ["GET", "auth/export"],
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

test("credential/forget + auth/:provider/logout: a space with no agent signs out through the setup runtime (PRODUCT-1662)", async () => {
  const { base, ws, channel, stop } = await setup();
  try {
    const forget = await fetch(`${base}/setup-runtime/credential/forget`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ provider: "anthropic" }),
    });
    expect(forget.status).toBe(200);
    expect(await forget.json()).toEqual({ ok: true });
    expect(channel.forgotten).toEqual([
      {
        ctx: expect.objectContaining({
          workspace: expect.objectContaining({ id: ws.id }),
          agent: expect.objectContaining({ workspaceId: ws.id }),
        }),
        provider: "anthropic",
      },
    ]);

    const logout = await fetch(`${base}/setup-runtime/auth/anthropic/logout`, {
      method: "POST",
      headers: auth,
    });
    expect(logout.status).toBe(200);
    expect(channel.dispatched).toEqual([
      expect.objectContaining({
        method: "POST",
        rest: "auth/anthropic/logout",
      }),
    ]);

    const missing = await fetch(`${base}/setup-runtime/credential/forget`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({}),
    });
    expect(missing.status).toBe(400);
    expect(channel.forgotten).toHaveLength(1);
  } finally {
    stop();
  }
});

test("credential/claude-oauth mirrors the per-agent push (validated envelope, personal-workspace scope, channel error → 502)", async () => {
  const { base, ws, channel, stop } = await setup();
  try {
    const ok = await fetch(`${base}/setup-runtime/credential/claude-oauth`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ claudeAiOauth: { accessToken: "at-1" } }),
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });
    expect(channel.claudeOAuth).toHaveLength(1);
    expect(channel.claudeOAuth[0]?.accessToken).toBe("at-1");
    expect(channel.claudeOAuth[0]?.ctx.agent.workspaceId).toBe(ws.id);

    const bad = await fetch(`${base}/setup-runtime/credential/claude-oauth`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ nope: true }),
    });
    expect(bad.status).toBe(400);
    expect(channel.claudeOAuth).toHaveLength(1);

    channel.claudeOAuthError = new Error("not available here");
    const refused = await fetch(
      `${base}/setup-runtime/credential/claude-oauth`,
      {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ claudeAiOauth: { accessToken: "at-2" } }),
      },
    );
    expect(refused.status).toBe(502);
    expect(await refused.json()).toEqual({ error: "not available here" });
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
