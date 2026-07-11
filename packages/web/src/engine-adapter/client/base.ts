import type { HoustonSdk } from "@houston/sdk";
import { bus } from "../bus";
// The barrel, not `cp/events` directly: the test suite mocks `../control-plane`
// and overrides `subscribeEvents`; a submodule import would bypass that mock.
import { subscribeEvents } from "../control-plane";
import { DEFAULT_AGENT_ID } from "../synthetic";
import { AdapterContext, type HoustonClientOptions } from "./context";

/**
 * The root of the {@link HoustonClient} mixin chain. Holds the ONE
 * {@link AdapterContext} (shared by every cluster mixin via `this.ctx`) and the
 * handful of always-present methods that don't belong to a cluster: the events
 * bridge, the active-space setter, the SDK accessor, and the lifecycle no-ops
 * the shell calls.
 */
export class HoustonClientBase {
  protected readonly ctx: AdapterContext;

  constructor(opts: HoustonClientOptions) {
    this.ctx = new AdapterContext(opts);
  }

  /**
   * Cloud mode: open the host's global reactivity stream (`/v1/events`, SSE) and
   * fan it onto the in-process bus the UI already listens on — so an activity,
   * routine, or skill changing server-side invalidates the right query. Tied to
   * the EngineWebSocket connect/disconnect lifecycle (returns the unsubscribe).
   * Standalone web mode has no host stream, so this is a no-op.
   */
  subscribeServerEvents(): () => void {
    const cp = this.ctx.cp;
    if (!cp) return () => {};
    return subscribeEvents(cp, (e) => bus.emit(e));
  }

  /**
   * Pin (or clear) the active hosted space (C8 §Workspaces bridge). Delegates to
   * the ONE {@link AdapterContext}, which mutates the shared `ControlPlaneConfig`
   * in place so every gateway call reroutes immediately. `role` is per-space, so
   * the caller MUST re-fetch `capabilities()` after switching (C8 §capabilities);
   * this only redirects the transport.
   */
  setActiveOrg(slug: string | null): void {
    this.ctx.setActiveOrg(slug);
  }

  /**
   * Point this client at a new engine endpoint in place. The desktop shell
   * calls this whenever a config lands on an already-built client: the
   * sidecar restarting on a fresh random port (HOU-432), and every hosted
   * bearer rotation (`setHostedEngineSessionToken`) — so the instance every
   * hook holds keeps working instead of being rebuilt. Delegates to the ONE
   * {@link AdapterContext}. Mirrors `HoustonClient.setEndpoint` in
   * `ui/engine-client` — the shell treats the two clients interchangeably.
   */
  setEndpoint(config: { baseUrl: string; token: string }): void {
    this.ctx.setEndpoint(config);
  }

  /**
   * The web-side {@link HoustonSdk} (migration wave 1). Exposes the SDK's write
   * modules — `agents`, `activities`, `providers`, `integrations`,
   * `preferences` — so later waves delegate control-plane WRITES here (matching
   * iOS) instead of re-implementing them in this adapter. It is INERT: no
   * `/v1/events` stream, no request until a write is dispatched.
   */
  get engineSdk(): HoustonSdk {
    return this.ctx.sdk;
  }

  // ---- lifecycle no-ops the shell calls ----
  // The host owns the file watcher + routine scheduler; there is nothing for the
  // client to start/stop/sync, so these resolve without touching the engine.
  async startAgentWatcher(): Promise<void> {}
  async stopAgentWatcher(): Promise<void> {}
  async startRoutineScheduler(): Promise<void> {}
  async stopRoutineScheduler(): Promise<void> {}
  async syncRoutineScheduler(): Promise<void> {}

  wsUrl(): string {
    return "";
  }

  /** @internal — exposed so the WS adapter can identify the default agent. */
  defaultAgentId(): string {
    return DEFAULT_AGENT_ID;
  }
}
