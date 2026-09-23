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
   * Tell the client the active space's agent list is NOT coming — boot resolved
   * no workspace to list agents for (the workspace load failed, or the account
   * has none), so `listAgents` is never called.
   *
   * Without it, provider routing waits on a list that can never arrive: every
   * connect throws "still loading" and the probe skips itself, so the picker and
   * the AI hub spin forever. This settles them onto the pref-based path
   * (HOU-979). A later successful `listAgents` supersedes it.
   */
  noteAgentsUnavailable(): void {
    this.ctx.noteAgentsUnavailable();
  }

  /**
   * Point this client at a new engine endpoint in place. The desktop shell
   * calls this whenever a config lands on an already-built client: the
   * sidecar restarting on a fresh random port (HOU-432), and every hosted
   * bearer rotation (`setHostedEngineSessionToken`) — so the instance every
   * hook holds keeps working instead of being rebuilt. Delegates to the ONE
   * {@link AdapterContext}. Mirrors `HoustonClient.setEndpoint` on the
   * adapter's own client — the shell treats the two interchangeably.
   */
  setEndpoint(config: { baseUrl: string; token: string }): void {
    this.ctx.setEndpoint(config);
  }

  /**
   * The web-side {@link HoustonSdk} — the one implementation of Houston's
   * client behavior this adapter delegates every domain call to. Reactivity is
   * off: no `/v1/events` stream of its own, and no request until a mixin makes
   * one.
   */
  get engineSdk(): HoustonSdk {
    return this.ctx.sdk;
  }

  wsUrl(): string {
    return "";
  }

  /** @internal — exposed so the WS adapter can identify the default agent. */
  defaultAgentId(): string {
    return DEFAULT_AGENT_ID;
  }
}
