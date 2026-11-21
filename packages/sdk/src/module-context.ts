import type { HoustonEngineClient } from "@houston/runtime-client";
import type { AuthExpiryNotifier } from "./auth-expiry";
import type { CommandHandler } from "./commands";
import type { SdkConfig } from "./ports";
import type { ScopeStore } from "./store";

export interface ModuleContext {
  config: SdkConfig;
  store: ScopeStore;
  clientFor(agentId: string): HoustonEngineClient;
  authExpiry: AuthExpiryNotifier;
  registerCommand(type: string, handler: CommandHandler): void;
}
