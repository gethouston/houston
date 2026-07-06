import type { IncomingMessage, ServerResponse } from "node:http";
import type { CustomEndpoint } from "@houston/protocol";
import type {
  CaptureResult,
  ChannelCtx,
  RuntimeChannel,
  TurnPin,
} from "../ports";
import { OPENAI_COMPATIBLE } from "../providers";
import {
  customEndpointKey,
  PROVIDER,
  prefixFor,
  type TurnDeps,
} from "../turn/deps";
import { dispatchCloudrun } from "../turn/dispatch";
import { dispatchTurn } from "../turn/start-turn";

/**
 * Placeholder API key for a keyless local server. Keyless endpoints (Ollama /
 * LM Studio / vLLM) ignore Authorization, but pi requires SOME key to resolve a
 * request, so a blank key becomes this. Mirrors the runtime's own constant
 * (`runtime/src/auth/login.ts` LOCAL_PLACEHOLDER_KEY) — the value only needs to
 * be non-empty; the two packages share no code across the host/runtime boundary.
 */
const LOCAL_PLACEHOLDER_KEY = "houston-local";

/**
 * The per-turn channel: no standing runtime — every request is served against
 * the turn runtime (Cloud Run) + object-storage workspace prefix. Connect-once
 * runs through the control plane itself (turn/connect.ts), so the credential is
 * already central and capture just confirms it.
 */
export class TurnChannel implements RuntimeChannel {
  constructor(private readonly deps: TurnDeps) {}

  dispatch(
    ctx: ChannelCtx,
    method: string,
    rest: string,
    url: URL,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    return dispatchCloudrun(
      this.deps,
      ctx.workspace,
      ctx.agent,
      method,
      rest,
      url,
      req,
      res,
    );
  }

  async fireTurn(
    ctx: ChannelCtx,
    conversationId: string,
    text: string,
    pin?: TurnPin,
    // The per-turn cloud runtime hydrates a fresh process per POST /turn and has
    // no standing sandbox proxy to relay an acting-user header to; the acting-as
    // identity flows through the standing-pod path (ProxyChannel). Accepted to
    // keep the port aligned, ignored here.
    _actingUser?: string,
  ): Promise<void> {
    const outcome = await dispatchTurn(
      this.deps,
      ctx.workspace,
      ctx.agent,
      conversationId,
      text,
      undefined,
      pin,
    );
    if (outcome.status === "quota") throw new Error(outcome.message);
    if (outcome.status === "busy")
      throw new Error("a turn is already running for this agent");
  }

  async cancelTurn(ctx: ChannelCtx, conversationId: string): Promise<boolean> {
    // The per-turn model has one turn slot per agent, owned by the relay — but
    // the slot may be running a DIFFERENT conversation's turn (a live chat
    // while this routine's run row is stale-running), so the cancel is scoped
    // to this conversation's key and no-ops otherwise.
    return this.deps.relay.cancel(
      ctx.agent.id,
      `${ctx.agent.id}/${conversationId}`,
    );
  }

  async teardown(ctx: ChannelCtx): Promise<void> {
    await this.deps.vfs.deletePrefix(prefixFor(ctx.workspace, ctx.agent));
  }

  async captureCredential(
    ctx: ChannelCtx,
    provider?: string,
  ): Promise<CaptureResult> {
    // Cloud connect-once already lands the credential centrally (turn/connect.ts);
    // capture just confirms it. Cloud serves only the subscription provider.
    const cred = await this.deps.credentials.get(
      ctx.workspace.id,
      provider || PROVIDER,
    );
    return cred
      ? { ok: true, provider: cred.provider }
      : { ok: false, status: 400, error: "agent is not connected yet" };
  }

  async forgetCredential(ctx: ChannelCtx, provider: string): Promise<void> {
    await this.deps.credentials.remove(ctx.workspace.id, provider);
  }

  /**
   * Store a pasted API key centrally. There is no standing runtime to push to —
   * the per-turn runtime receives it baked into the next POST /turn (start-turn),
   * and auth status reads it straight from the central store (dispatchCloudrun).
   */
  async saveApiKeyCredential(
    ctx: ChannelCtx,
    provider: string,
    apiKey: string,
  ): Promise<void> {
    await this.deps.credentials.put({
      workspaceId: ctx.workspace.id,
      provider,
      accessToken: apiKey,
      refreshToken: "",
      expiresAt: 0,
      kind: "api_key",
    });
  }

  /**
   * The multi-tenant per-turn Cloud Run image keeps Anthropic OFF — a
   * subscription credential (and its refresh token) must never land in a shared
   * per-turn process. Hosted Anthropic runs only on the single-tenant standing
   * pod (ProxyChannel), so this channel refuses the push. This is the explicit
   * gate that scopes the refresh-token-on-pod decision to single-tenant only.
   */
  async saveClaudeOAuthCredential(): Promise<void> {
    throw new Error(
      "Claude subscription connect isn't available in the cloud per-turn runtime.",
    );
  }

  /**
   * Persist an OpenAI-compatible endpoint for the per-turn runtime. There is no
   * standing runtime to POST to (unlike ProxyChannel): the per-turn runtime
   * hydrates its data dir from this object-storage prefix at the start of each
   * turn, so writing `custom-endpoint.json` under the SAME key/schema the runtime
   * reads (packages/runtime/src/ai/openai-compatible.ts) is what a later turn
   * picks up. The endpoint (base URL + model) rides that hydrated file; the
   * matching AUTH rides a central credential (below), served per turn.
   */
  async saveCustomEndpoint(
    ctx: ChannelCtx,
    endpoint: CustomEndpoint,
  ): Promise<void> {
    const stored = {
      baseUrl: endpoint.baseUrl,
      model: endpoint.model,
      name: endpoint.name,
      contextWindow: endpoint.contextWindow,
      reasoning: endpoint.reasoning,
    };
    await this.deps.vfs.writeText(
      customEndpointKey(prefixFor(ctx.workspace, ctx.agent)),
      JSON.stringify(stored, null, 2),
    );
    // The per-turn runtime authenticates the endpoint from a SERVED credential:
    // dispatchTurn → freshCredential(ws, "openai-compatible") → the runtime's
    // applyServedCredential writes auth.json, where pi reads the key by
    // model.provider. Store one now — the user's key, or the keyless placeholder
    // — as an api_key credential (never expires, no refresh). WITHOUT it every
    // turn hard-errors "No provider connected", and the endpoint's key must never
    // sit in the hydrated custom-endpoint.json (that file is not auth).
    await this.deps.credentials.put({
      workspaceId: ctx.workspace.id,
      provider: OPENAI_COMPATIBLE,
      accessToken: endpoint.apiKey?.trim() || LOCAL_PLACEHOLDER_KEY,
      refreshToken: "",
      expiresAt: 0,
      kind: "api_key",
    });
  }
}
