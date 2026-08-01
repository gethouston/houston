import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, test } from "vitest";
import type {
  CaptureResult,
  ChannelCtx,
  RuntimeChannel,
  RuntimeState,
} from "../ports";
import { MemoryWorkspaceStore } from "../store/memory";
import { type AgentRouteDeps, handleAgents } from "./agents";

/**
 * The acting-as trust seam on the four CREDENTIAL routes (C2/C5). The gateway is
 * the trust boundary: only it can mint `x-houston-acting-as`, so only a
 * gateway-fronted host may read one. Off the gateway (desktop / self-host) the
 * client talks to this server directly, so an inbound header is forged input —
 * and a forged one here does real damage: the runtime files the credential into
 * a per-user `auth-users/<hash>.json` scope instead of the shared `auth.json`,
 * so the user connects a provider and every agent still reads as disconnected.
 *
 * Mirrors channel/proxy-acting.test.ts (the dispatch/relay side of the same
 * seam) one level up, at the routes that read the header themselves.
 */

/** A well-formed acting-v1 header a client could trivially forge itself. */
const FORGED = `acting-v1.${Buffer.from(
  JSON.stringify({ sub: "mallory", name: "Mallory" }),
  "utf8",
).toString("base64url")}.not-a-real-signature`;

const CLAUDE_ENVELOPE = {
  claudeAiOauth: {
    accessToken: "sk-ant-oat-ACCESS",
    refreshToken: "sk-ant-ort-REFRESH",
    expiresAt: 1_800_000_000_000,
  },
};

/**
 * The four credential routes, each with the minimum body its validator demands
 * (an api-key provider pi-ai knows; a complete claudeAiOauth envelope) so every
 * request actually reaches the channel instead of stopping at a 400.
 */
const ROUTES = [
  { path: "credential/capture", body: { provider: "openrouter" } },
  { path: "credential/forget", body: { provider: "openrouter" } },
  {
    path: "credential/api-key",
    body: { provider: "openrouter", apiKey: "sk-or-test" },
  },
  { path: "credential/claude-oauth", body: CLAUDE_ENVELOPE },
] as const;

/**
 * A record-only channel: every credential operation captures the ChannelCtx the
 * route handed it and succeeds. What the runtime would DO with `actingAs` is
 * ProxyChannel's business (proxy-acting.test.ts) — here only the ctx matters.
 */
class RecordingChannel implements RuntimeChannel {
  readonly seen: ChannelCtx[] = [];

  async dispatch(): Promise<void> {}
  async fireTurn(): Promise<void> {}
  async cancelTurn(): Promise<boolean> {
    return false;
  }
  async busy(): Promise<boolean> {
    return false;
  }
  async runtimeStatus(): Promise<RuntimeState | "unknown"> {
    return "unknown";
  }
  async teardown(): Promise<void> {}
  async captureCredential(
    ctx: ChannelCtx,
    provider?: string,
  ): Promise<CaptureResult> {
    this.seen.push(ctx);
    return { ok: true, provider: provider ?? "openrouter" };
  }
  async saveApiKeyCredential(ctx: ChannelCtx): Promise<void> {
    this.seen.push(ctx);
  }
  async saveClaudeOAuthCredential(ctx: ChannelCtx): Promise<void> {
    this.seen.push(ctx);
  }
  async saveCustomEndpoint(ctx: ChannelCtx): Promise<void> {
    this.seen.push(ctx);
  }
  async forgetCredential(ctx: ChannelCtx): Promise<void> {
    this.seen.push(ctx);
  }
}

interface Fixture {
  base: string;
  close: () => void;
  channel: RecordingChannel;
  agentId: string;
}

/** Boot handleAgents over real HTTP so a client-supplied header rides req.headers. */
async function boot(opts: { gatewayFronted: boolean }): Promise<Fixture> {
  const store = new MemoryWorkspaceStore({ defaultRuntime: "gke" });
  const workspace = await store.getOrCreatePersonalWorkspace("alice");
  const agent = await store.createAgent({
    workspaceId: workspace.id,
    name: "Sales",
  });
  const channel = new RecordingChannel();
  const deps: AgentRouteDeps = {
    store,
    channels: { gke: channel },
    gatewayFronted: opts.gatewayFronted,
  };

  const s = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://x");
    // Single-principal host: the bearer names the acting user.
    const userId = req.headers.authorization?.replace(/^Bearer /, "") || "";
    void handleAgents(
      deps,
      userId,
      req.method || "GET",
      url.pathname,
      url,
      req,
      res,
    )
      .then((handled) => {
        if (!handled) {
          res.writeHead(404);
          res.end();
        }
      })
      .catch((err) => {
        res.writeHead(500);
        res.end(String(err));
      });
  });
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", () => r()));
  return {
    base: `http://127.0.0.1:${(s.address() as AddressInfo).port}`,
    close: () => s.close(),
    channel,
    agentId: agent.id,
  };
}

function post(fx: Fixture, path: string, body: unknown, actingAs?: string) {
  return fetch(`${fx.base}/agents/${encodeURIComponent(fx.agentId)}/${path}`, {
    method: "POST",
    headers: {
      Authorization: "Bearer alice",
      "Content-Type": "application/json",
      ...(actingAs ? { "x-houston-acting-as": actingAs } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe.each(ROUTES)("POST /agents/:id/$path — acting-as trust", ({
  path,
  body,
}) => {
  test("desktop profile: a forged acting-as header is IGNORED", async () => {
    const fx = await boot({ gatewayFronted: false });
    try {
      const res = await post(fx, path, body, FORGED);
      expect(res.status).toBe(200);
      expect(fx.channel.seen).toHaveLength(1);
      // The credential must land in the workspace's shared scope, exactly as it
      // would with no header at all.
      expect(fx.channel.seen[0]?.actingAs).toBeUndefined();
    } finally {
      fx.close();
    }
  });

  test("desktop profile: a forged header changes nothing vs no header", async () => {
    const fx = await boot({ gatewayFronted: false });
    try {
      expect((await post(fx, path, body)).status).toBe(200);
      expect((await post(fx, path, body, FORGED)).status).toBe(200);
      const [withoutHeader, withHeader] = fx.channel.seen;
      expect(withHeader?.actingAs).toBe(withoutHeader?.actingAs);
    } finally {
      fx.close();
    }
  });

  test("gateway-fronted profile: the minted header reaches the channel verbatim", async () => {
    const fx = await boot({ gatewayFronted: true });
    try {
      const res = await post(fx, path, body, FORGED);
      expect(res.status).toBe(200);
      expect(fx.channel.seen[0]?.actingAs).toBe(FORGED);
    } finally {
      fx.close();
    }
  });
});
