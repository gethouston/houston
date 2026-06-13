import type { IncomingMessage, ServerResponse } from "node:http";
import type { CaptureResult, ChannelCtx, RuntimeChannel } from "../ports";
import { dispatchCloudrun } from "../turn/dispatch";
import { PROVIDER, prefixFor, type TurnDeps } from "../turn/deps";

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
    return dispatchCloudrun(this.deps, ctx.workspace, ctx.agent, method, rest, req, res);
  }

  async teardown(ctx: ChannelCtx): Promise<void> {
    await this.deps.vfs.deletePrefix(prefixFor(ctx.workspace, ctx.agent));
  }

  async captureCredential(ctx: ChannelCtx): Promise<CaptureResult> {
    const cred = await this.deps.credentials.get(ctx.workspace.id, PROVIDER);
    return cred
      ? { ok: true, provider: cred.provider }
      : { ok: false, status: 400, error: "agent is not connected yet" };
  }
}
