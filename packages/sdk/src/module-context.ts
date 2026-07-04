import type { HoustonEngineClient } from "@houston/runtime-client";
import type { AuthExpiryNotifier } from "./auth-expiry";
import type { CommandHandler } from "./commands";
import type { SdkConfig } from "./ports";
import type { ScopeStore } from "./store";

/**
 * The wiring surface handed to every module factory (`create<Name>Module`).
 *
 * A module reads config, publishes snapshots to the shared {@link ScopeStore},
 * calls the engine through a per-agent {@link HoustonEngineClient} resolved by
 * {@link clientFor}, surfaces 401s through the shared {@link authExpiry}
 * notifier, and registers its write handlers via {@link registerCommand}.
 * Modules never construct these collaborators themselves — the kernel owns
 * exactly one of each (one store, one client cache, one auth notifier, one
 * command registry) and threads them in.
 */
export interface ModuleContext {
  /** Immutable SDK configuration (base URL + ports). */
  config: SdkConfig;
  /** The shared reactive store modules publish scope snapshots into. */
  store: ScopeStore;
  /**
   * Resolve the engine client rooted at agent `agentId`'s sandbox — the host
   * nests per-agent routes under `/agents/<id>` (protocol v3), so conversation,
   * history, turn, and settings calls must go through this. An empty `agentId`
   * returns the client rooted at the base URL itself (the single-runtime local
   * profile, where routes are flat). Clients are memoized and share the injected
   * `fetch`, so this is cheap to call per operation.
   */
  clientFor(agentId: string): HoustonEngineClient;
  /**
   * The shared 401 → `session/tokenExpired` notifier. Any module reports a
   * lapsed session token through this, so the signal has one shape and one
   * dedupe across the whole SDK.
   */
  authExpiry: AuthExpiryNotifier;
  /**
   * Register a command handler. Throws on a duplicate `type` (see
   * {@link CommandRegistry.register}).
   */
  registerCommand(type: string, handler: CommandHandler): void;
}
