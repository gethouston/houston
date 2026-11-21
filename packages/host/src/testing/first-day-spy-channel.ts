import type { TurnLimits } from "@houston/protocol";
import type { FireTurnOptions } from "../fire-turn-options";
import type { ChannelCtx, RuntimeChannel, TurnPin } from "../ports";

export interface Fired {
  conversationId: string;
  text: string;
  pin?: TurnPin;
  actingUser?: string;
  limits?: TurnLimits;
}

export class SpyChannel implements RuntimeChannel {
  fired: Fired[] = [];
  failWith: string | Error | null = null;
  gate: Promise<void> | null = null;
  async dispatch() {}
  async fireTurn(
    _ctx: ChannelCtx,
    conversationId: string,
    text: string,
    pin?: TurnPin,
    { actingUser, limits }: FireTurnOptions = {},
  ): Promise<void> {
    if (this.gate) await this.gate;
    this.fired.push({
      conversationId,
      text,
      pin,
      actingUser,
      ...(limits ? { limits } : {}),
    });
    if (this.failWith === null) return;
    throw typeof this.failWith === "string"
      ? new Error(this.failWith)
      : this.failWith;
  }
  async cancelTurn() {
    return false;
  }
  async busy() {
    return false;
  }
  async runtimeStatus() {
    return "running" as const;
  }
  async teardown() {}
  async captureCredential() {
    return { ok: true as const, provider: "openai-codex" };
  }
  async forgetCredential() {}
  async saveApiKeyCredential() {}
  async saveClaudeOAuthCredential() {}
  async saveCustomEndpoint() {}
}
