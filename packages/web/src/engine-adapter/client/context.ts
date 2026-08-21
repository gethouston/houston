import { HoustonEngineClient } from "@houston/runtime-client";
import type { HoustonSdk } from "@houston/sdk";
// Control-plane calls import from the barrel (`../control-plane`), never the
// `cp/*` submodules directly: the web test suite mocks the barrel module
// (`vi.mock("…/control-plane")`) and overrides `runtimeClientFor` /
// `gatewayAuthFetch` etc. — a direct submodule import would bypass the mock.
import type { Capabilities } from "../../../../../ui/engine-client/src/types";
import type { ControlPlaneConfig } from "../control-plane";
import {
  gatewayAuthFetch,
  liveToken,
  resetAgentColorSync,
  runtimeClientFor,
  setupRuntimeClientFor,
} from "../control-plane";
import {
  conversationCacheScope,
  setConversationCacheIdentity,
} from "../conversation-cache";
import { createEngineSdk } from "../sdk-client";
import { DEFAULT_AGENT_ID, toOldProvider } from "../synthetic";
import { WorkspaceIdResolver } from "./wire-workspace-id";

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
 * What the client knows about the ACTIVE SPACE's agents — the only
 * space-validated source for routing provider calls (HOU-979).
 *
 * Three states, not two, because "we have no list" hides two opposite
 * situations and collapsing them produced two separate bugs:
 *
 *  - `pending` — no list has resolved for THIS space yet (boot, or the window
 *    right after a space switch). The persisted `last_agent_id` still names the
 *    space the user just LEFT, so there is nothing safe to route on: provider
 *    calls refuse and the probe reports "checking".
 *  - `unavailable` — a list was asked for and could not be had (the request
 *    failed, or boot resolved no workspace to list agents for). Waiting forever
 *    on a list that is not coming bricks connect + the picker, so this degrades
 *    to the pre-HOU-979 behavior: route on the pref, probe for real. A later
 *    successful list upgrades back to `known` and strict validation returns.
 *  - `known` — the space's own agent ids. The pref is validated against them.
 */
export type AgentListState =
  | { readonly kind: "pending" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "known"; readonly ids: readonly string[] };

/**
 * The single, shared state + routing seam behind `HoustonClient`. Every method
 * cluster (the mixins under `client/`) reads `cp`/`engine`/`sdk` from the ONE
 * `AdapterContext` — no per-cluster copy. `cp` is a getter over a privately-held
 * `ControlPlaneConfig`; {@link setActiveOrg} mutates THAT object in place, so the
 * live `authFetch`, the per-agent runtime clients, and the SDK all reroute
 * through one source of truth with no rebuild (C8 §Active space).
 */
export class AdapterContext {
  // engine/sdk/baseUrl/token are mutable ONLY through setEndpoint below — the
  // in-place repoint the desktop shell relies on when the sidecar restarts.
  engine: HoustonEngineClient;
  baseUrl: string;
  token: string;
  /** The single web-side {@link HoustonSdk} (migration wave 1), built INERT
   *  (reactivity off) over the shared `authFetch`. Later waves delegate
   *  control-plane WRITES to its modules. */
  sdk: HoustonSdk;
  /** Live-token auth fetch (not a pinned `token`): hosted mode rotates the
   *  bearer mid-session and a 401 refreshes + replays (HOU-687). Shared by
   *  `engine` and the SDK, so `x-houston-org` has one live source
   *  (`setActiveOrg` mutates `_cp` in place; both re-read it). Rebuilt only by
   *  `setEndpoint`, which keeps its fallback bearer current. */
  authFetch: typeof fetch;
  /** Client→server workspace-id translation (the synthetic "default" personal
   *  id no server speaks), resolved once and shared by every caller that puts a
   *  workspace id on the wire. See `wire-workspace-id.ts`. */
  readonly workspaceIds = new WorkspaceIdResolver(this);
  /**
   * Memo for `deploymentServes()` (host-capabilities.ts): the deployment's
   * advertised capabilities, fetched once per endpoint. `null` = probe failed.
   */
  deploymentCaps: Promise<Capabilities | null> | undefined;
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
   * Repoint this context at a new engine endpoint IN PLACE (HOU-432): the
   * desktop shell calls `HoustonClient.setEndpoint` when the sidecar restarts
   * on a fresh random port, and on every hosted bearer rotation
   * (`setHostedEngineSessionToken`). The bearer needs no rework — every fetch
   * reads it live per attempt (`liveToken` off `window.__HOUSTON_ENGINE__`,
   * which the caller updates first). The pinned base URLs do: the shared
   * `ControlPlaneConfig` is mutated in place (per-agent runtime clients and
   * `cpFetch` re-read it per call), while `authFetch` + the direct runtime
   * client + the SDK are rebuilt, because their requesters capture the base
   * URL (and the fetch its fallback bearer) at construction.
   */
  setEndpoint(opts: { baseUrl: string; token: string }): void {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    // A repoint may land on a different deployment; re-probe its flags.
    this.deploymentCaps = undefined;
    this.token = opts.token;
    if (this._cp) {
      this._cp.baseUrl = this.baseUrl;
      this._cp.token = opts.token;
    }
    // The new bearer may belong to a DIFFERENT account (this client is
    // repointed in place, never rebuilt): the next agent list must re-merge
    // that account's `agent_colors` preference (PRODUCT-1344).
    resetAgentColorSync();
    this.authFetch = gatewayAuthFetch(
      opts.token,
      () => this._cp?.activeOrgSlug,
    );
    this.engine = new HoustonEngineClient({
      baseUrl: this.baseUrl,
      fetch: this.authFetch,
    });
    this.sdk = createEngineSdk({
      baseUrl: this.baseUrl,
      fetch: this.authFetch,
    });
  }

  /**
   * Pin (or clear) the active hosted space (C8 §Workspaces bridge). Mutates the
   * live `ControlPlaneConfig` in place — shared by every per-request fetch and
   * the long-lived per-agent runtime clients (whose auth-fetch re-reads it per
   * attempt) — so a switch takes effect at once. No-op off-cloud (`_cp === null`).
   *
   * A REAL space change also invalidates {@link agentList} (HOU-979): the ids it
   * holds belong to the space being left, and every one of them 404s under the
   * new `x-houston-org`. Without this the guard was first-boot-only — a Connect
   * clicked mid-switch still routed at the previous space's agent. Back to
   * `pending` means provider calls refuse (and the probe reports "checking")
   * until the new space's `listAgents` lands. Re-pinning the SAME slug (the
   * client rebuild in `lib/engine.ts`, a same-space reselect) changes nothing.
   */
  setActiveOrg(slug: string | null): void {
    if (!this._cp) return;
    if ((this._cp.activeOrgSlug ?? null) === (slug ?? null)) return;
    this._cp.activeOrgSlug = slug;
    this._agentList = { kind: "pending" };
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

  private _agentList: AgentListState = { kind: "pending" };

  /**
   * What we know about the ACTIVE space's agents. Ground truth for
   * {@link providerAgentId} and for `provider-routing.ts` — the pref can go
   * stale, a resolved list cannot.
   */
  get agentList(): AgentListState {
    return this._agentList;
  }

  /** Record the live agent-id set (called by every successful cp `listAgents`). */
  noteAgentList(ids: string[]): void {
    this._agentList = { kind: "known", ids };
  }

  /**
   * Record that the active space's agent list could NOT be obtained — a failed
   * `listAgents`, or a boot that resolved no workspace to list agents for.
   *
   * Never downgrades a list we already have: a background refresh failing is
   * not a reason to drop validation we can still do. It only converts the
   * "nothing yet" state into "nothing is coming", which is what lets provider
   * calls degrade to the pref instead of refusing forever.
   */
  noteAgentsUnavailable(): void {
    if (this._agentList.kind === "pending")
      this._agentList = { kind: "unavailable" };
  }

  /**
   * The agent PROVIDER calls should target. Provider credentials are
   * workspace-central (connect-once), so ANY real agent's runtime both serves
   * and captures them — the selection only picks a pod:
   *
   *   1. the selected agent, when the live list confirms it still exists;
   *   2. else the org's FIRST known agent — a stale pref or no selection must
   *      not force the setup runtime while real pods exist (the setup pod was
   *      torn down at the org's first agent, and re-materializing one costs a
   *      provision + a lingering Deployment);
   *   3. else `null` → the hidden setup runtime (true first-run, zero agents).
   *
   * With no `known` list there is nothing to validate against, so this falls
   * back to the raw pref. That is only safe once the list is known NOT to be
   * coming (`unavailable`); while it is still `pending`, provider callers must
   * not route at all — see `provider-routing.ts`, which refuses rather than
   * trust a pref that may still name the space the user just left.
   */
  providerAgentId(): string | null {
    const id = this.currentAgentId();
    const list = this._agentList;
    if (list.kind !== "known") return id;
    if (id && list.ids.includes(id)) return id;
    return list.ids[0] ?? null;
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

  /**
   * The SELECTED agent id, or a user-facing error if none is open. For routes
   * that genuinely mean "the agent the user has open" (project files, per-agent
   * prefs), where falling back to another agent would touch the wrong data.
   */
  requireAgentId(): string {
    const id = this.currentAgentId();
    if (!id) throw new Error("Open an agent first, then connect its account.");
    return id;
  }

  /** Runtime client for provider/auth calls: a real agent's sandbox in cloud
   *  whenever one exists (see {@link providerAgentId}), the single runtime
   *  locally. Before ANY agent exists (first-run onboarding), the host's
   *  hidden SETUP runtime — provider connect must work pre-agent, and its
   *  capture lands on the personal workspace so the agent created next is
   *  already connected. */
  providerEngine(): HoustonEngineClient {
    if (!this._cp) return this.engine;
    const id = this.providerAgentId();
    return id
      ? runtimeClientFor(this._cp, id)
      : setupRuntimeClientFor(this._cp);
  }

  /** Runtime client pinned to a specific agent, independent of UI selection. */
  providerEngineFor(agentId: string): HoustonEngineClient {
    return this._cp ? runtimeClientFor(this._cp, agentId) : this.engine;
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
