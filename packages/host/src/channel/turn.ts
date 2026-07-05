import type { IncomingMessage, ServerResponse } from "node:http";
import type {
  CaptureResult,
  ChannelCtx,
  RuntimeChannel,
  TurnPin,
} from "../ports";
import { PROVIDER, prefixFor, type TurnDeps } from "../turn/deps";
import { dispatchCloudrun } from "../turn/dispatch";
import { dispatchTurn } from "../turn/start-turn";

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

  async cancelTurn(ctx: ChannelCtx, _conversationId: string): Promise<boolean> {
    // The per-turn model has one turn slot per agent, owned by the relay —
    // cancelling the agent's slot IS cancelling the conversation's turn.
    return this.deps.relay.cancel(ctx.agent.id);
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
   * OpenAI-compatible (local) servers are unreachable from the cloud per-turn
   * runtime — its egress sandbox can't dial the user's localhost. The host route
   * already refuses this on the `openaiCompatible` capability; this is the
   * defense-in-depth backstop so a cloud channel never silently accepts one.
   */
  async saveCustomEndpoint(): Promise<void> {
    throw new Error(
      "Local models aren't available in the cloud — they run on your own machine. Use the desktop app.",
    );
  }
}
