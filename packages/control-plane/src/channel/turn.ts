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
    _url: URL,
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    return dispatchCloudrun(
      this.deps,
      ctx.workspace,
      ctx.agent,
      method,
      rest,
      req,
      res,
    );
  }

  async fireTurn(
    ctx: ChannelCtx,
    conversationId: string,
    text: string,
    pin?: TurnPin,
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
}
