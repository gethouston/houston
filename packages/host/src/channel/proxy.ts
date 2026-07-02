import type { IncomingMessage, ServerResponse } from "node:http";
import type { CustomEndpoint } from "@houston/protocol";
import type {
  CaptureResult,
  ChannelCtx,
  CredentialStore,
  ForwardRequest,
  RuntimeChannel,
  RuntimeEndpoint,
  RuntimeLauncher,
  TurnPin,
} from "../ports";

/**
 * Forwards one authorized request to a standing runtime and streams the reply
 * back (SSE byte-for-byte). Concrete impl: proxy/route.ts `forward`. Kept as a
 * shape so the channel depends on an interface, not a module.
 */
export interface RuntimeProxy {
  forward(
    endpoint: RuntimeEndpoint,
    request: ForwardRequest,
    res: ServerResponse,
  ): Promise<void>;
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
      /**
       * Whether an inbound `x-houston-acting-as` header is relayed to the
       * runtime. The runtime decodes that token's payload WITHOUT verifying
       * it (C2/C5: the gateway is the trust boundary), so this must be true
       * ONLY when a trusted gateway sits in front minting/stripping the
       * header (cloud). On the desktop clients reach this host directly —
       * forwarding would let any client forge message attribution, so the
       * local profile sets false and inbound headers are dropped. The
       * routine path is unaffected either way: fireTurn's server-minted
       * `x-houston-acting-user` never rides this header.
       */
      forwardActingHeader: boolean;
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

    // Forward the gateway's per-turn acting-as token (C2) verbatim — nothing is
    // minted host-side; when absent the runtime acts as the workspace owner.
    // Gateway-fronted deployments only (forwardActingHeader): without a gateway
    // to have minted it, an inbound header is untrusted client input and is
    // dropped. A single-value header only.
    const actingHeader = this.opts.forwardActingHeader
      ? req.headers["x-houston-acting-as"]
      : undefined;
    const actingAs = Array.isArray(actingHeader)
      ? actingHeader[0]
      : actingHeader;

    return this.opts.proxy.forward(
      endpoint,
      {
        method,
        path: `/${rest}`,
        search: qs ? `?${qs}` : "",
        contentType: req.headers["content-type"] ?? null,
        body,
        actingAs,
      },
      res,
    );
  }

  async fireTurn(
    ctx: ChannelCtx,
    conversationId: string,
    text: string,
    pin?: TurnPin,
    actingUser?: string,
  ): Promise<void> {
    // Wake the standing runtime and POST the routine's prompt as a normal
    // message — the runtime starts the turn (202) and persists the reply into
    // the conversation, exactly as a user message would. The routine's model/
    // effort pins ride alongside (omitted when absent → the session's current).
    // A non-2xx throws so the scheduler records an errored run.
    const endpoint = await this.opts.launcher.ensureAwake(ctx.agent);
    const res = await fetch(
      `${endpoint.baseUrl}/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${endpoint.token}`,
          // C2 routine path: no per-turn acting-as token is minted — the runtime
          // instead forwards this creator sub on its integration calls (paired
          // pod-side with the pod token). Omitted for legacy creator-less routines.
          ...(actingUser ? { "x-houston-acting-user": actingUser } : {}),
        },
        body: JSON.stringify({
          text,
          ...(pin?.model ? { model: pin.model } : {}),
          ...(pin?.effort ? { effort: pin.effort } : {}),
        }),
      },
    );
    if (!res.ok) {
      throw new Error(
        `runtime ${res.status}: ${await res.text().catch(() => "")}`,
      );
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
  async captureCredential(
    ctx: ChannelCtx,
    provider?: string,
  ): Promise<CaptureResult> {
    const endpoint = await this.opts.launcher.ensureAwake(ctx.agent);
    const q = provider ? `?provider=${encodeURIComponent(provider)}` : "";
    const exp = await fetch(`${endpoint.baseUrl}/auth/export${q}`, {
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
      kind?: "oauth" | "api_key";
      access?: string;
      refresh?: string;
      expires?: number;
      key?: string;
      accountId?: string;
      enterpriseUrl?: string;
    };

    // API-key provider: store the key as a non-refreshing, non-expiring
    // credential. Nothing to scrub (no refresh token ever sat in the sandbox).
    if (c.kind === "api_key") {
      if (!c.provider || !c.key) {
        return { ok: false, status: 400, error: "agent is not connected yet" };
      }
      await this.opts.credentials.put({
        workspaceId: ctx.agent.workspaceId,
        provider: c.provider,
        kind: "api_key",
        accessToken: c.key,
        refreshToken: "",
        expiresAt: Number.MAX_SAFE_INTEGER,
      });
      return { ok: true, provider: c.provider };
    }

    if (
      !c.provider ||
      !c.access ||
      !c.refresh ||
      typeof c.expires !== "number"
    ) {
      return { ok: false, status: 400, error: "agent is not connected yet" };
    }
    await this.opts.credentials.put({
      workspaceId: ctx.agent.workspaceId,
      provider: c.provider,
      kind: "oauth",
      accessToken: c.access,
      refreshToken: c.refresh,
      accountId: c.accountId,
      expiresAt: c.expires,
      // Copilot Enterprise domain, so the central refresh targets the company's
      // GitHub. Absent for every other OAuth provider (and individual Copilot).
      enterpriseUrl: c.enterpriseUrl,
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

  /**
   * Store a pasted API key centrally for the whole workspace,
   * then push it into the standing runtime's auth.json so the provider reads as
   * connected immediately (instead of only after the next turn's serve sync). The
   * central store is the source of truth — the push is what makes status instant.
   * A push failure surfaces (the user retries; re-pushing is idempotent), but the
   * credential is already safely stored.
   */
  async saveApiKeyCredential(
    ctx: ChannelCtx,
    provider: string,
    apiKey: string,
  ): Promise<void> {
    await this.opts.credentials.put({
      workspaceId: ctx.agent.workspaceId,
      provider,
      accessToken: apiKey,
      refreshToken: "",
      expiresAt: 0,
      kind: "api_key",
    });
    const endpoint = await this.opts.launcher.ensureAwake(ctx.agent);
    const res = await fetch(
      `${endpoint.baseUrl}/auth/${encodeURIComponent(provider)}/api-key`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${endpoint.token}`,
        },
        body: JSON.stringify({ key: apiKey }),
      },
    );
    if (!res.ok) {
      throw new Error(
        `key stored, but the agent runtime did not accept it (${res.status}) — try connecting again`,
      );
    }
  }

  /**
   * Persist an OpenAI-compatible (local) endpoint in the standing runtime. The
   * base URL is the user's own machine, so there's nothing to store centrally —
   * the runtime owns it (settings.json + a key in auth.json). On the desktop this
   * proxy reaches the local subprocess; the runtime persists it across restarts.
   */
  async saveCustomEndpoint(
    ctx: ChannelCtx,
    endpoint: CustomEndpoint,
  ): Promise<void> {
    const rt = await this.opts.launcher.ensureAwake(ctx.agent);
    const res = await fetch(`${rt.baseUrl}/providers/openai-compatible`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${rt.token}`,
      },
      body: JSON.stringify(endpoint),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(
        `the local model could not be connected (${res.status})${
          detail ? `: ${detail}` : ""
        }`,
      );
    }
  }
}
