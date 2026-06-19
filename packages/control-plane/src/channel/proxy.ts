import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  CaptureResult,
  ChannelCtx,
  CredentialStore,
  ForwardRequest,
  RuntimeChannel,
  RuntimeEndpoint,
  RuntimeLauncher,
} from "../ports";

/**
 * Forwards one authorized request to a standing runtime and streams the reply
 * back (SSE byte-for-byte). Concrete impl: proxy/route.ts `forward`. Kept as a
 * shape so the channel depends on an interface, not a module.
 */
export interface RuntimeProxy {
  forward(endpoint: RuntimeEndpoint, request: ForwardRequest, res: ServerResponse): Promise<void>;
}

/**
 * The standing-runtime channel: wake the agent's runtime (GKE pod today, local
 * subprocess in P4) and relay the request 1:1 over the runtime's whole contract
 * (chat, SSE events, provider device-code login, settings).
 */
export class ProxyChannel implements RuntimeChannel {
  constructor(
    private readonly opts: {
      launcher: RuntimeLauncher;
      proxy: RuntimeProxy;
      credentials: CredentialStore;
    },
  ) {}

  async dispatch(
    ctx: ChannelCtx,
    method: string,
    rest: string,
    url: URL,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    // First touch spins the runtime up (a GKE cold start can take a minute or two).
    const endpoint = await this.opts.launcher.ensureAwake(ctx.agent);

    // Collect the raw body for non-GET so arbitrary payloads ({text}, {code},
    // {activeProvider}) pass through untouched. Strip the caller's `token` auth
    // param so the user's JWT is never leaked downstream to the runtime.
    let body: Buffer | undefined;
    if (method !== "GET" && method !== "HEAD") {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      body = Buffer.concat(chunks);
    }
    const params = new URLSearchParams(url.search);
    params.delete("token");
    const qs = params.toString();

    return this.opts.proxy.forward(
      endpoint,
      {
        method,
        path: `/${rest}`,
        search: qs ? `?${qs}` : "",
        contentType: req.headers["content-type"] ?? null,
        body,
      },
      res,
    );
  }

  async fireTurn(ctx: ChannelCtx, conversationId: string, text: string): Promise<void> {
    // Wake the standing runtime and POST the routine's prompt as a normal
    // message — the runtime starts the turn (202) and persists the reply into
    // the conversation, exactly as a user message would. A non-2xx throws so
    // the scheduler records an errored run.
    const endpoint = await this.opts.launcher.ensureAwake(ctx.agent);
    const res = await fetch(
      `${endpoint.baseUrl}/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${endpoint.token}` },
        body: JSON.stringify({ text }),
      },
    );
    if (!res.ok) {
      throw new Error(`runtime ${res.status}: ${await res.text().catch(() => "")}`);
    }
  }

  async teardown(ctx: ChannelCtx): Promise<void> {
    await this.opts.launcher.destroy(ctx.agent.id, { dropVolume: true });
  }

  /**
   * Connect-once capture: pull the credential out of the agent's runtime, store
   * it for the WHOLE workspace, then scrub the runtime's refresh token (Gate #2).
   * A scrub failure is security-relevant and surfaces — the connection itself
   * succeeded; reconnecting retries capture + scrub.
   */
  async captureCredential(ctx: ChannelCtx): Promise<CaptureResult> {
    const endpoint = await this.opts.launcher.ensureAwake(ctx.agent);
    const exp = await fetch(`${endpoint.baseUrl}/auth/export`, {
      headers: { Authorization: `Bearer ${endpoint.token}` },
    });
    if (!exp.ok) {
      return {
        ok: false,
        status: 502,
        error: "could not read agent credential",
        detail: await exp.text().catch(() => ""),
      };
    }
    const c = (await exp.json()) as {
      provider?: string;
      access?: string;
      refresh?: string;
      expires?: number;
      accountId?: string;
    };
    if (!c.provider || !c.access || !c.refresh || typeof c.expires !== "number") {
      return { ok: false, status: 400, error: "agent is not connected yet" };
    }
    await this.opts.credentials.put({
      workspaceId: ctx.agent.workspaceId,
      provider: c.provider,
      accessToken: c.access,
      refreshToken: c.refresh,
      accountId: c.accountId,
      expiresAt: c.expires,
    });
    const scrub = await fetch(`${endpoint.baseUrl}/auth/scrub-refresh`, {
      method: "POST",
      headers: { Authorization: `Bearer ${endpoint.token}` },
    });
    if (!scrub.ok) {
      return {
        ok: false,
        status: 502,
        error:
          "credential stored, but the agent sandbox could not be scrubbed of the refresh token — reconnect to retry",
        detail: await scrub.text().catch(() => ""),
      };
    }
    return { ok: true, provider: c.provider };
  }

  /**
   * Connect-once logout: drop the workspace's central credential for a provider.
   * Every agent runtime re-pulls this credential from the host before each turn,
   * so removing it here is what actually logs the workspace out — clearing a
   * single runtime's local auth.json alone would be undone by the next re-serve.
   */
  async forgetCredential(ctx: ChannelCtx, provider: string): Promise<void> {
    await this.opts.credentials.remove(ctx.agent.workspaceId, provider);
  }
}
