import { HoustonEngineClient } from "@houston/runtime-client";
import type { HoustonSdk } from "@houston/sdk";
// Control-plane calls import from the barrel (`../control-plane`), never the
// `cp/*` submodules directly: the web test suite mocks the barrel module
// (`vi.mock("…/control-plane")`) and overrides `runtimeClientFor` /
// `gatewayAuthFetch` etc. — a direct submodule import would bypass the mock.
import type { ControlPlaneConfig } from "../control-plane";
import {
  gatewayAuthFetch,
  liveToken,
  runtimeClientFor,
  setupRuntimeClientFor,
} from "../control-plane";
import {
  conversationCacheScope,
  setConversationCacheIdentity,
} from "../conversation-cache";
import { createEngineSdk } from "../sdk-client";
import { DEFAULT_AGENT_ID, toOldProvider } from "../synthetic";

export interface HoustonClientOptions {
  baseUrl: string;
  token: string;
  /** When true, route agents + chat through the Houston control plane (cloud). */
  controlPlane?: boolean;
}

/**
 * localStorage key persisting the selected agent (`setPreference("last_agent_id")`).
 * `providerEngine()` routes provider connects by it, so it must never name an
 * agent the host doesn't have — see `dropLastAgentPref`.
 */
export const LAST_AGENT_PREF = "houston.pref.last_agent_id";

/**
 * The single, shared state + routing seam behind `HoustonClient`. Every method
 * cluster (the mixins under `client/`) reads `cp`/`engine`/`sdk` from the ONE
 * `AdapterContext` — no per-cluster copy. `cp` is a getter over a privately-held
 * `ControlPlaneConfig`; {@link setActiveOrg} mutates THAT object in place, so the
 * live `authFetch`, the per-agent runtime clients, and the SDK all reroute
 * through one source of truth with no rebuild (C8 §Active space).
 */
export class AdapterContext {
  readonly engine: HoustonEngineClient;
  readonly baseUrl: string;
  readonly token: string;
  /** The single web-side {@link HoustonSdk} (migration wave 1), built INERT
   *  (reactivity off) over the shared `authFetch`. Later waves delegate
   *  control-plane WRITES to its modules. */
  readonly sdk: HoustonSdk;
  /** Live-token auth fetch (not a pinned `token`): hosted mode rotates the
   *  bearer mid-session and a 401 refreshes + replays (HOU-687). Built ONCE and
   *  shared by `engine` and the SDK, so `x-houston-org` has one live source
   *  (`setActiveOrg` mutates `_cp` in place; both re-read it). */
  readonly authFetch: typeof fetch;
  /** In-flight cloud device-code logins, keyed `${agentId}:${providerId}` — the poll guard. */
  readonly activeLogins = new Set<string>();
  /** Per-provider auth-status pollers that translate login completion into events (local mode). */
  readonly loginWatchers = new Map<string, ReturnType<typeof setInterval>>();
  /** Non-null in cloud mode: agents + chat go through the control plane. */
  private readonly _cp: ControlPlaneConfig | null;

  constructor(opts: HoustonClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.token = opts.token;
    const useCp =
      opts.controlPlane ??
      (typeof window !== "undefined" && !!window.__HOUSTON_CP__);
    this._cp = useCp
      ? { baseUrl: opts.baseUrl.replace(/\/+$/, ""), token: opts.token }
      : null;
    // Local conversation cache (HOU-712) — cloud only, scoped per gateway +
    // signed-in user. Reads the LIVE bearer so a token refresh keeps the same
    // scope while a different account lands in different keys; local engines
    // resolve null and never cache (their reads are local disk, never held).
    const cp = this._cp;
    setConversationCacheIdentity(() =>
      cp ? conversationCacheScope(cp.baseUrl, liveToken(cp.token)) : null,
    );
    const authFetch = gatewayAuthFetch(
      opts.token,
      () => this._cp?.activeOrgSlug,
    );
    this.authFetch = authFetch;
    this.engine = new HoustonEngineClient({
      baseUrl: opts.baseUrl,
      fetch: authFetch,
    });
    // INERT: reactivity is off, so constructing the SDK opens NO stream and
    // fires NO request — it only holds the write surface for later waves. It
    // rides the SAME `authFetch`, so bearer/401-refresh/active-space match.
    this.sdk = createEngineSdk({ baseUrl: this.baseUrl, fetch: authFetch });
    // Mark the new TS engine as the active backend so the frontend can surface
    // new-engine-only capabilities (e.g. API-key providers like OpenCode).
    if (typeof window !== "undefined") {
      (
        window as unknown as { __HOUSTON_NEW_ENGINE__?: boolean }
      ).__HOUSTON_NEW_ENGINE__ = true;
    }
  }

  /** The live control-plane config (cloud), or null (local/self-host). */
  get cp(): ControlPlaneConfig | null {
    return this._cp;
  }

  /**
   * Pin (or clear) the active hosted space (C8 §Workspaces bridge). Mutates the
   * live `ControlPlaneConfig` in place — shared by every per-request fetch and
   * the long-lived per-agent runtime clients (whose auth-fetch re-reads it per
   * attempt) — so a switch takes effect at once. No-op off-cloud (`_cp === null`).
   */
  setActiveOrg(slug: string | null): void {
    if (this._cp) this._cp.activeOrgSlug = slug;
  }

  /** The CP agent the user has selected (persisted as last_agent_id), or null. */
  currentAgentId(): string | null {
    try {
      const id = localStorage.getItem(LAST_AGENT_PREF);
      return id && id !== DEFAULT_AGENT_ID ? id : null;
    } catch {
      return null;
    }
  }

  /**
   * Forget the persisted agent selection when it names an agent the control
   * plane no longer has (deleted last agent, wiped user data, account switch) —
   * a stale id sends first-run logins to `/agents/<dead>/…` → 404.
   */
  dropLastAgentPref(isStale: (id: string) => boolean): void {
    try {
      const id = localStorage.getItem(LAST_AGENT_PREF);
      if (id && id !== DEFAULT_AGENT_ID && isStale(id))
        localStorage.removeItem(LAST_AGENT_PREF);
    } catch {
      /* storage disabled — currentAgentId() reads null there anyway */
    }
  }

  /** The selected agent id, or a user-facing error if none is open. */
  requireAgentId(): string {
    const id = this.currentAgentId();
    if (!id) throw new Error("Open an agent first, then connect its account.");
    return id;
  }

  /** Runtime client for provider/auth calls: the selected agent's sandbox in
   *  cloud, the single runtime locally. Before ANY agent exists (first-run
   *  onboarding), the host's hidden SETUP runtime — provider connect must work
   *  pre-agent, and its capture lands on the personal workspace so the agent
   *  created next is already connected. */
  providerEngine(): HoustonEngineClient {
    if (!this._cp) return this.engine;
    const id = this.currentAgentId();
    return id
      ? runtimeClientFor(this._cp, id)
      : setupRuntimeClientFor(this._cp);
  }

  /** The one config both deployments share: the gateway in cloud mode, the
   *  local/self-host host otherwise — each serves `/v1/preferences/:key`. */
  prefConfig(): ControlPlaneConfig {
    return this._cp ?? { baseUrl: this.baseUrl, token: this.token };
  }

  async activeOld(): Promise<{ provider: string; model: string }> {
    try {
      // Cloud: providers are PER-AGENT, reached through the control-plane proxy
      // (the per-agent runtime client carries the live token). A top-level
      // /providers on the base client has no route and a stale token → 401.
      const engine = this.providerEngine();
      if (engine) {
        // Bounded: this call sits on the BOOT path (listWorkspaces → the app's
        // wsLoading splash), and a per-agent read against a cold/warming
        // engine is held until the engine wakes — minutes. The value only
        // labels the synthetic workspace, so after a short budget fall back
        // to the defaults instead of wedging the first paint (HOU-693).
        const providers = await Promise.race([
          engine.listProviders(),
          new Promise<null>((r) => setTimeout(() => r(null), 4_000)),
        ]);
        if (providers) {
          const active =
            providers.find((p) => p.isActive) ??
            providers.find((p) => p.configured);
          if (active)
            return {
              provider: toOldProvider(active.id),
              model: active.activeModel,
            };
        }
      }
    } catch {
      /* engine unreachable / no agent selected / not authed → defaults below */
    }
    return { provider: "anthropic", model: "claude-sonnet-4-6" };
  }
}
