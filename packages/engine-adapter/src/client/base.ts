import type { HoustonSdk } from "@houston/sdk";
import { bus } from "../bus";
import { subscribeEvents } from "../control-plane";
import { DEFAULT_AGENT_ID } from "../synthetic";
import { AdapterContext, type HoustonClientOptions } from "./context";

export class HoustonClientBase {
  protected readonly ctx: AdapterContext;

  constructor(opts: HoustonClientOptions) {
    this.ctx = new AdapterContext(opts);
  }

  subscribeServerEvents(): () => void {
    const cp = this.ctx.cp;
    if (!cp) return () => {};
    return subscribeEvents(cp, (e) => bus.emit(e));
  }

  setActiveOrg(slug: string | null): void {
    this.ctx.setActiveOrg(slug);
  }

  noteAgentsUnavailable(): void {
    this.ctx.noteAgentsUnavailable();
  }

  setEndpoint(config: { baseUrl: string; token: string }): void {
    this.ctx.setEndpoint(config);
  }

  get engineSdk(): HoustonSdk {
    return this.ctx.sdk;
  }

  wsUrl(): string {
    return "";
  }

  defaultAgentId(): string {
    return DEFAULT_AGENT_ID;
  }
}
