import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { MemoryCredentialStore } from "../credentials/store";
import type { Agent, Workspace } from "../domain/types";
import { FakeLauncher } from "../launcher/fake";
import {
  ApiKeyRejectedError,
  type ChannelCtx,
  type RuntimeChannel,
  type WorkspaceCredential,
} from "../ports";
import { forward } from "../proxy/route";
import { ConnectManager } from "../turn/connect";
import type { TurnDeps } from "../turn/deps";
import { TurnQuota } from "../turn/quota";
import { TurnRelay } from "../turn/relay";
import { MemoryVfs } from "../vfs";
import { ProxyChannel, type RuntimeProxy } from "./proxy";
import { TurnChannel } from "./turn";

/**
 * The RuntimeChannel CONTRACT — the COMMON surface both adapters MUST honor,
 * run verbatim against each. The two channels intentionally diverge in HOW they
 * reach a runtime (ProxyChannel wakes a standing runtime and relays raw HTTP 1:1;
 * TurnChannel runs per-turn against Cloud Run + object storage), so the wire-byte
 * specifics live in their own integration-style tests (proxy/route.test.ts,
 * turn/dispatch.test.ts). What's shared — and what this suite pins so the host
 * can pick a channel by `workspace.runtime` and never branch again — is:
 *
 *   - captureCredential: ok:false ("not connected yet") before a connection,
 *     ok:true with the provider once connected.
 *   - forgetCredential: removes the workspace credential from the store, so a
 *     subsequent turn cannot re-serve it (connect-once logout).
 *   - dispatch serves the same /providers wire surface, and its `configured`
 *     flag reflects whether the workspace is connected.
 *   - fireTurn resolves on the happy path (a turn was accepted).
 *   - teardown resolves without throwing (runtime-side state is removed).
 *
 * Each `make()` returns the channel plus a `connect()` that brings the agent to
 * the connected state through that channel's OWN mechanism: for ProxyChannel the
 * fake runtime starts exposing a credential on /auth/export (capture pulls it
 * into the store); for TurnChannel the central store gets the credential
 * directly (connect-once runs in the control plane). The contract never reaches
 * past the interface into those mechanisms.
 *
 * DIVERGENCES NOT ASSERTED HERE (covered per-impl):
 *   - dispatch's transport: ProxyChannel pipes the runtime's bytes (SSE, errors)
 *     1:1 (proxy/route.test.ts); TurnChannel synthesizes the wire surface from
 *     object storage + the relay (turn/dispatch.test.ts).
 *   - teardown's effect: ProxyChannel destroys the pod + PVC; TurnChannel deletes
 *     the object-storage prefix. The contract asserts only that it completes.
 *   - captureCredential's path: ProxyChannel export→store→scrub against the
 *     runtime; TurnChannel just confirms the already-central credential.
 */

const ws: Workspace = {
  id: "w1",
  ownerUserId: "alice",
  kind: "personal",
  name: "Personal",
  slug: "alice",
  runtime: "cloudrun",
  createdAt: 1,
};
const agent: Agent = {
  id: "agent-1",
  workspaceId: "w1",
  name: "Sales",
  createdAt: 1,
};
const ctx: ChannelCtx = { workspace: ws, agent };

interface ChannelFixture {
  channel: RuntimeChannel;
  /** Bring the agent to the connected state via this channel's own mechanism. */
  connect: () => Promise<void>;
  /** The central store both fixtures back the channel with — so the contract can
   *  assert forgetCredential actually emptied it, channel-agnostically. */
  credentials: MemoryCredentialStore;
  /** The object store a per-turn channel persists to (TurnChannel only). */
  vfs?: MemoryVfs;
}

/** Drive a RuntimeChannel.dispatch through a real HTTP server (it needs req/res). */
function serve(
  channel: RuntimeChannel,
): Promise<{ base: string; close: () => void }> {
  const s = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://x");
    const rest = url.pathname.replace(/^\//, "");
    void channel
      .dispatch(ctx, req.method || "GET", rest, url, req, res)
      .catch((err) => {
        res.writeHead(500);
        res.end(String(err));
      });
  });
  return new Promise((resolve) =>
    s.listen(0, "127.0.0.1", () =>
      resolve({
        base: `http://127.0.0.1:${(s.address() as AddressInfo).port}`,
        close: () => s.close(),
      }),
    ),
  );
}

function runRuntimeChannelContract(
  name: string,
  make: () => ChannelFixture,
): void {
  describe(`RuntimeChannel contract: ${name}`, () => {
    test("captureCredential is not-connected before, connected after", async () => {
      const { channel, connect } = make();
      const before = await channel.captureCredential(ctx);
      expect(before.ok).toBe(false);
      if (!before.ok) expect(before.error).toContain("not connected");

      await connect();
      const after = await channel.captureCredential(ctx);
      expect(after.ok).toBe(true);
      if (after.ok) expect(after.provider).toBe("openai-codex");
    });

    test("forgetCredential removes the workspace credential (logout)", async () => {
      const { channel, connect, credentials } = make();
      await connect();
      expect(await credentials.get(ws.id, "openai-codex")).not.toBeNull();

      // Logout: the central credential is gone, so the next turn can't re-serve it.
      await channel.forgetCredential(ctx, "openai-codex");
      expect(await credentials.get(ws.id, "openai-codex")).toBeNull();
    });

    test("saveApiKeyCredential stores a pasted key centrally (api-key, no refresh/expiry)", async () => {
      const { channel, credentials } = make();
      await channel.saveApiKeyCredential(ctx, "opencode", "sk-opencode-zen");
      const cred = await credentials.get(ws.id, "opencode");
      expect(cred).not.toBeNull();
      expect(cred?.accessToken).toBe("sk-opencode-zen");
      expect(cred?.refreshToken).toBe("");
      expect(cred?.expiresAt).toBe(0);
      expect(cred?.kind).toBe("api_key");
    });

    test("dispatch serves /providers; `configured` reflects the connection", async () => {
      const { channel, connect } = make();
      const { base, close } = await serve(channel);
      try {
        let providers = (await (await fetch(`${base}/providers`)).json()) as {
          configured: boolean;
        }[];
        expect(providers[0]?.configured).toBe(false);

        await connect();
        providers = (await (await fetch(`${base}/providers`)).json()) as {
          configured: boolean;
        }[];
        expect(providers[0]?.configured).toBe(true);
      } finally {
        close();
      }
    });

    test("fireTurn resolves once a turn is accepted (happy path)", async () => {
      const { channel, connect } = make();
      await connect();
      await expect(
        channel.fireTurn(ctx, "c1", "run the routine"),
      ).resolves.toBeUndefined();
    });

    test("teardown resolves without throwing", async () => {
      const { channel, connect } = make();
      await connect();
      await expect(channel.teardown(ctx)).resolves.toBeUndefined();
    });
  });
}

// ---------------------------------------------------------------------------
// ProxyChannel fixture: a FakeLauncher pointing at a fake standing runtime that
// speaks the slice of the runtime contract the channel touches — /auth/export,
// /auth/scrub-refresh, /providers, and POST /conversations/:id/messages. The
// real RuntimeProxy (proxy/route.ts `forward`) relays dispatch 1:1.
// ---------------------------------------------------------------------------
let proxyRuntime: Server;
let proxyRuntimeUrl = "";
let proxyConnected = false; // flips when connect() succeeds (export exposes a cred)
/** Last body the fake runtime received on POST /providers/openai-compatible. */
let proxyCustomEndpointBody: unknown = null;
/** Last body the fake runtime received on POST /auth/anthropic/oauth-credential. */
let proxyClaudeOAuthBody: unknown = null;
/** When set, the fake runtime rejects /auth/:provider/api-key with this reply. */
let proxyApiKeyRejection: { status: number; body: unknown } | null = null;

beforeAll(async () => {
  proxyRuntime = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://x");
    const path = url.pathname;
    const reply = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };

    // OpenAI-compatible (local) connect: capture the body so the test can assert
    // the channel forwarded the endpoint verbatim.
    if (path === "/providers/openai-compatible") {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c as Buffer));
      req.on("end", () => {
        proxyCustomEndpointBody = JSON.parse(
          Buffer.concat(chunks).toString("utf8") || "{}",
        );
        reply(200, { ok: true });
      });
      return;
    }

    if (path === "/auth/export") {
      // Before connect the runtime has no usable credential; after, it exports one.
      return proxyConnected
        ? reply(200, {
            provider: "openai-codex",
            access: "AT",
            refresh: "RT",
            expires: Date.now() + 3_600_000,
            accountId: "acct-9",
          })
        : reply(200, {}); // present but incomplete → "agent is not connected yet"
    }
    // Hosted Claude-subscription push: capture the CLI envelope the channel sent.
    if (path === "/auth/anthropic/oauth-credential") {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c as Buffer));
      req.on("end", () => {
        proxyClaudeOAuthBody = JSON.parse(
          Buffer.concat(chunks).toString("utf8") || "{}",
        );
        reply(200, { ok: true });
      });
      return;
    }
    if (path === "/auth/scrub-refresh") return reply(200, { ok: true });
    // API-key connect pushes the pasted key into the standing runtime.
    if (path.match(/^\/auth\/[^/]+\/api-key$/)) {
      return proxyApiKeyRejection
        ? reply(proxyApiKeyRejection.status, proxyApiKeyRejection.body)
        : reply(200, { ok: true });
    }
    if (path === "/providers")
      return reply(200, [{ id: "openai-codex", configured: proxyConnected }]);
    if (path.match(/^\/conversations\/[^/]+\/messages$/))
      return reply(202, { ok: true });
    return reply(404, { error: "not found" });
  });
  await new Promise<void>((r) =>
    proxyRuntime.listen(0, "127.0.0.1", () => r()),
  );
  proxyRuntimeUrl = `http://127.0.0.1:${(proxyRuntime.address() as AddressInfo).port}`;
});

afterAll(() => proxyRuntime.close());

function makeProxyFixture(): ChannelFixture {
  proxyConnected = false; // each fixture starts disconnected
  proxyApiKeyRejection = null;
  const credentials = new MemoryCredentialStore();
  const launcher = new FakeLauncher({ baseUrl: proxyRuntimeUrl, token: "sbx" });
  const proxy: RuntimeProxy = { forward };
  const channel = new ProxyChannel({
    launcher,
    proxy,
    credentials,
    forwardActingHeader: false,
  });
  return {
    channel,
    credentials,
    connect: async () => {
      // The agent runtime now holds a credential; capture pulls it into the
      // store + scrubs (the connect-once dance for a standing runtime).
      proxyConnected = true;
      const res = await channel.captureCredential(ctx);
      expect(res.ok).toBe(true);
    },
  };
}

// ---------------------------------------------------------------------------
// TurnChannel fixture: a TurnDeps wired to a fake per-turn Cloud Run runtime
// (the same fake the dispatch.test.ts uses — POST /turn streams user→text→done).
// connect-once is central, so connect() just seeds the credential store.
// ---------------------------------------------------------------------------
let turnRuntime: Server;
let turnRuntimeUrl = "";

beforeAll(async () => {
  turnRuntime = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.write(": connected\n\n");
      res.write(
        `data: ${JSON.stringify({ type: "user", data: { content: "hi", ts: 1 } })}\n\n`,
      );
      res.write(
        `data: ${JSON.stringify({ type: "text", data: "done work" })}\n\n`,
      );
      res.write(`data: ${JSON.stringify({ type: "done", data: null })}\n\n`);
      res.end();
    });
  });
  await new Promise<void>((r) => turnRuntime.listen(0, "127.0.0.1", () => r()));
  turnRuntimeUrl = `http://127.0.0.1:${(turnRuntime.address() as AddressInfo).port}`;
});

afterAll(() => turnRuntime.close());

function makeTurnFixture(): ChannelFixture {
  const objects = new MemoryVfs();
  const credentials = new MemoryCredentialStore();
  const deps: TurnDeps = {
    runtimeUrl: turnRuntimeUrl,
    turnToken: "turn-secret",
    relay: new TurnRelay(),
    quota: new TurnQuota({ maxConcurrent: 2, perHour: 100 }),
    vfs: objects,
    credentials,
    connect: new ConnectManager(credentials),
    refresh: async (cred: WorkspaceCredential) => ({
      ...cred,
      accessToken: "AT-refreshed",
      expiresAt: Date.now() + 3_600_000,
    }),
    idToken: async () => "google-id-token",
    codexModels: ["gpt-5.5"],
  };
  const channel = new TurnChannel(deps);
  return {
    channel,
    credentials,
    vfs: objects,
    connect: async () => {
      await credentials.put({
        workspaceId: ws.id,
        provider: "openai-codex",
        accessToken: "AT",
        refreshToken: "RT",
        accountId: "acct-9",
        expiresAt: Date.now() + 3_600_000,
      });
    },
  };
}

runRuntimeChannelContract("ProxyChannel", makeProxyFixture);
runRuntimeChannelContract("TurnChannel", makeTurnFixture);

// The runtime's live key verification can REFUSE a pasted key; the typed
// `reason` on its 401 body must survive the proxy hop so the route (and from
// there the connect dialog) can show actionable copy — and a refused key must
// never land in the central store.
describe("saveApiKeyCredential rejection (ProxyChannel)", () => {
  test("forwards the runtime's message + typed reason, stores nothing", async () => {
    const { channel, credentials } = makeProxyFixture();
    proxyApiKeyRejection = {
      status: 401,
      body: {
        error:
          "this google API key is blocked by its own settings: enable the API",
        reason: "key_restricted",
      },
    };
    const err = await channel
      .saveApiKeyCredential(ctx, "google", "AIza-restricted")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiKeyRejectedError);
    expect((err as ApiKeyRejectedError).reason).toBe("key_restricted");
    expect((err as ApiKeyRejectedError).message).toContain(
      "blocked by its own settings",
    );
    expect(await credentials.get(ws.id, "google")).toBeNull();
  });

  test("a reason-less rejection still surfaces the runtime's message", async () => {
    const { channel } = makeProxyFixture();
    proxyApiKeyRejection = { status: 401, body: { error: "nope" } };
    const err = await channel
      .saveApiKeyCredential(ctx, "openrouter", "sk-bad")
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiKeyRejectedError);
    expect((err as ApiKeyRejectedError).reason).toBeUndefined();
    expect((err as ApiKeyRejectedError).message).toBe("nope");
  });
});

// saveCustomEndpoint is the ONE asymmetric channel op (not part of the shared
// contract): the standing runtime is POSTed the endpoint live; the per-turn
// channel has no live runtime, so it persists the endpoint to object storage
// under the same key/schema the next turn's runtime hydrates.
describe("saveCustomEndpoint (asymmetric persistence path)", () => {
  test("ProxyChannel forwards the endpoint to the standing runtime", async () => {
    proxyCustomEndpointBody = null;
    const { channel } = makeProxyFixture();
    await channel.saveCustomEndpoint(ctx, {
      baseUrl: "https://ollama.example.com/v1",
      model: "llama3.1",
      name: "Llama",
    });
    expect(proxyCustomEndpointBody).toEqual({
      baseUrl: "https://ollama.example.com/v1",
      model: "llama3.1",
      name: "Llama",
    });
  });

  test("TurnChannel (cloud per-turn) persists the endpoint to object storage", async () => {
    const { channel, vfs } = makeTurnFixture();
    await channel.saveCustomEndpoint(ctx, {
      baseUrl: "https://ollama.example.com/v1",
      model: "llama3.1",
      name: "Llama",
      contextWindow: 8192,
      reasoning: true,
      // The API key is intentionally NOT persisted here (it lives in auth.json,
      // which the per-turn runtime injects and never hydrates from storage).
      apiKey: "sk-should-not-be-written",
    });
    // Same key the runtime reads: <prefix>/data/custom-endpoint.json.
    const raw = await vfs?.readText("ws/w1/agent-1/data/custom-endpoint.json");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw ?? "{}")).toEqual({
      baseUrl: "https://ollama.example.com/v1",
      model: "llama3.1",
      name: "Llama",
      contextWindow: 8192,
      reasoning: true,
    });
  });
});

// saveClaudeOAuthCredential is the other asymmetric channel op: the single-tenant
// standing pod materializes the pushed Claude credential (central store + pod
// file), keeping the refresh token on the pod; the multi-tenant per-turn cloud
// channel refuses it (Anthropic is off there).
describe("saveClaudeOAuthCredential (single-tenant only, asymmetric)", () => {
  const cred = {
    accessToken: "sk-ant-oat-access",
    refreshToken: "sk-ant-ort-refresh",
    expiresAt: 1_800_000_000_000,
    scopes: ["user:inference"],
    subscriptionType: "max",
  };

  test("ProxyChannel dual-writes: central store + the pod's config file", async () => {
    proxyClaudeOAuthBody = null;
    const { channel, credentials } = makeProxyFixture();
    await channel.saveClaudeOAuthCredential(ctx, cred);

    const stored = await credentials.get(ws.id, "anthropic");
    expect(stored?.kind).toBe("oauth");
    expect(stored?.accessToken).toBe("sk-ant-oat-access");
    // Gate #2 departure, scoped here: the refresh token is kept for the pod.
    expect(stored?.refreshToken).toBe("sk-ant-ort-refresh");
    expect(stored?.expiresAt).toBe(1_800_000_000_000);

    // The pod received the CLI envelope verbatim.
    expect(proxyClaudeOAuthBody).toEqual({ claudeAiOauth: cred });
  });

  test("TurnChannel (cloud per-turn) refuses the Claude credential", async () => {
    const { channel } = makeTurnFixture();
    await expect(channel.saveClaudeOAuthCredential(ctx, cred)).rejects.toThrow(
      /cloud|per-turn|available/i,
    );
  });

  test("an overwrite push with an already-expired access token is rejected, keeping the live credential (HOU-892)", async () => {
    // A fresh browser login always mints a future-dated access token. An
    // expired one on the overwrite path is a stale cached snapshot wearing the
    // wrong hat — accepting it clobbers the live rotated credential and
    // re-revokes the family (observed live: a 7-hours-expired snapshot
    // overwrote a freshly reconnected credential).
    const { channel, credentials } = makeProxyFixture();
    await channel.saveClaudeOAuthCredential(ctx, cred); // live credential

    const stale = { ...cred, accessToken: "sk-ant-oat-stale", expiresAt: 1 };
    await expect(channel.saveClaudeOAuthCredential(ctx, stale)).rejects.toThrow(
      /expired/i,
    );
    expect((await credentials.get(ws.id, "anthropic"))?.accessToken).toBe(
      "sk-ant-oat-access",
    );

    // The same stale snapshot on the RECONCILE path (fill-only) stays a quiet
    // no-op against a live credential — reconciles legitimately carry old
    // snapshots and must neither clobber nor error.
    await channel.saveClaudeOAuthCredential(ctx, stale, { ifAbsent: true });
    expect((await credentials.get(ws.id, "anthropic"))?.accessToken).toBe(
      "sk-ant-oat-access",
    );
  });

  test("a credential without an expiry still overwrites (absent metadata proves nothing)", async () => {
    const { channel, credentials } = makeProxyFixture();
    const { expiresAt: _dropped, ...noExpiry } = {
      ...cred,
      accessToken: "sk-ant-oat-no-expiry",
    };
    await channel.saveClaudeOAuthCredential(ctx, noExpiry);
    expect((await credentials.get(ws.id, "anthropic"))?.accessToken).toBe(
      "sk-ant-oat-no-expiry",
    );
  });
});
