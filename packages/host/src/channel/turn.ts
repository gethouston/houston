import type { IncomingMessage, ServerResponse } from "node:http";
import type { CustomEndpoint } from "@houston/protocol";
import { normalizeTurnMode } from "@houston/protocol";
import type {
  CaptureResult,
  ChannelCtx,
  RuntimeChannel,
  TurnPin,
} from "../ports";
import { liveTurnPin, liveTurns } from "../routes/live-turn";
import { PROVIDER, prefixFor, type TurnDeps } from "../turn/deps";
import { dispatchCloudrun } from "../turn/dispatch";
import { dispatchTurn } from "../turn/start-turn";
import { turnBusyError } from "./fire-error";
import { storeApiKeyCredential, storeCustomEndpoint } from "./turn-credentials";

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
      // The route may have already drained the body (the turn path peeks it to
      // stamp mission attribution); the stream is exhausted by then, so the
      // dispatch parses this buffer instead of re-reading nothing.
      ctx.body,
    );
  }

  async fireTurn(
    ctx: ChannelCtx,
    conversationId: string,
    text: string,
    pin?: TurnPin,
    // The per-turn cloud runtime hydrates a fresh process per POST /turn and has
    // no standing sandbox proxy to relay an acting-user header to; the acting-as
    // identity flows through the standing-pod path (ProxyChannel). Not sent to
    // the runtime here - recorded on the turn, which is where the `/sandbox/*`
    // routes read it from.
    actingUser?: string,
    actingAs?: string,
  ): Promise<void> {
    // A turn begins here for every programmatic fire (a routine, a trigger, a
    // mission's first turn): the host records which conversation this agent is
    // working in AND whose name the work is done in, because a runtime's own
    // claim about either is not evidence (routes/live-turn.ts).
    liveTurns.start(
      ctx.agent.id,
      conversationId,
      normalizeTurnMode(pin?.mode),
      {
        actingAs,
        actingUser,
      },
      liveTurnPin(pin),
    );
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
      throw turnBusyError(await this.runningConversation(ctx));
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

  /** The conversation whose turn holds the agent's slot, when one does. */
  private async runningConversation(ctx: ChannelCtx): Promise<string | null> {
    const key = await this.deps.relay.holder(ctx.agent.id);
    const prefix = `${ctx.agent.id}/`;
    return key?.startsWith(prefix) ? key.slice(prefix.length) : null;
  }

  async busy(ctx: ChannelCtx): Promise<boolean> {
    return this.deps.relay.busy(ctx.agent.id);
  }

  async runtimeStatus(ctx: ChannelCtx) {
    return (await this.busy(ctx)) ? "running" : "asleep";
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

  /** Store a pasted API key centrally (turn-credentials.ts). */
  async saveApiKeyCredential(
    ctx: ChannelCtx,
    provider: string,
    apiKey: string,
    endpoint?: string,
  ): Promise<void> {
    await storeApiKeyCredential(this.deps, ctx, provider, apiKey, endpoint);
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
   * standing runtime to POST to (unlike ProxyChannel), so the endpoint lands in
   * object storage plus a central credential (turn-credentials.ts).
   */
  async saveCustomEndpoint(
    ctx: ChannelCtx,
    endpoint: CustomEndpoint,
  ): Promise<void> {
    await storeCustomEndpoint(this.deps, ctx, endpoint);
  }
}
