import type { IncomingMessage, ServerResponse } from "node:http";
import type { CustomEndpoint } from "@houston/protocol";
import { normalizeTurnMode } from "@houston/protocol";
import type { FireTurnOptions } from "../fire-turn-options";
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
      ctx.body,
    );
  }

  async fireTurn(
    ctx: ChannelCtx,
    conversationId: string,
    text: string,
    pin?: TurnPin,
    { actingUser, actingAs, limits, nonce }: FireTurnOptions = {},
  ): Promise<void> {
    liveTurns.start(
      ctx.agent.id,
      conversationId,
      normalizeTurnMode(pin?.mode),
      { actingAs, actingUser, limits },
      liveTurnPin(pin),
    );
    const outcome = await dispatchTurn(
      this.deps,
      ctx.workspace,
      ctx.agent,
      conversationId,
      text,
      nonce,
      pin,
    );
    if (outcome.status === "quota") throw new Error(outcome.message);
    if (outcome.status === "busy")
      throw turnBusyError(await this.runningConversation(ctx));
  }

  async cancelTurn(ctx: ChannelCtx, conversationId: string): Promise<boolean> {
    return this.deps.relay.cancel(
      ctx.agent.id,
      `${ctx.agent.id}/${conversationId}`,
    );
  }

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

  async saveApiKeyCredential(
    ctx: ChannelCtx,
    provider: string,
    apiKey: string,
    endpoint?: string,
  ): Promise<void> {
    await storeApiKeyCredential(this.deps, ctx, provider, apiKey, endpoint);
  }

  async saveClaudeOAuthCredential(): Promise<void> {
    throw new Error(
      "Claude subscription connect isn't available in the cloud per-turn runtime.",
    );
  }

  async saveCustomEndpoint(
    ctx: ChannelCtx,
    endpoint: CustomEndpoint,
  ): Promise<void> {
    await storeCustomEndpoint(this.deps, ctx, endpoint);
  }
}
