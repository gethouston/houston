/**
 * Where this client points, and who it speaks as.
 *
 * The transport half of {@link AdapterContext}: the base URL, the bearer, the
 * one `authFetch` both the HoustonClient and the SDK ride, and the live
 * `ControlPlaneConfig` that routes hosted calls at a space. It owns the two
 * repoints the shell performs on a LIVE client — a new engine
 * ({@link EngineEndpoint.setEndpoint}) and a new space
 * ({@link EngineEndpoint.setActiveOrg}) — so every consequence of "we now talk
 * to something else" (which requesters rebuild, which caches are void, what the
 * agent list still means) is decided in one file. {@link AdapterContext} extends
 * it, so every member here is reached off the shared context like the rest.
 */

import { HoustonEngineClient } from "@houston/runtime-client";
import type { HoustonSdk } from "@houston/sdk";
// Control-plane calls import from the barrel (`../control-plane`), never the
// `cp/*` submodules directly: the web test suite mocks the barrel module
// (`vi.mock("…/control-plane")`) and overrides `runtimeClientFor` /
// `gatewayAuthFetch` etc. — a direct submodule import would bypass the mock.
import type { Capabilities } from "@houston/wire-types";
import type { ControlPlaneConfig } from "../control-plane";
import {
  gatewayAuthFetch,
  liveToken,
  resetAgentColorSync,
} from "../control-plane";
import {
  conversationCacheScope,
  setConversationCacheIdentity,
} from "../conversation-cache";
import { createEngineSdk } from "../sdk-client";
import { AgentSelection } from "./agent-selection";

export interface HoustonClientOptions {
  baseUrl: string;
  token: string;
  /** When true, route agents + chat through the Houston control plane (cloud). */
  controlPlane?: boolean;
}

/** The endpoint + auth state, mixed into the adapter context. */
export abstract class EngineEndpoint extends AgentSelection {
  // engine/sdk/baseUrl/token are mutable ONLY through setEndpoint below — the
  // in-place repoint the desktop shell relies on when the sidecar restarts.
  engine: HoustonEngineClient;
  baseUrl: string;
  token: string;
  /** The single web-side {@link HoustonSdk}, built over the shared `authFetch`
   *  with reactivity off (web owns its read model). Every mixin's domain call
   *  lands on one of its modules. */
  sdk: HoustonSdk;
  /** Live-token auth fetch (not a pinned `token`): hosted mode rotates the
   *  bearer mid-session and a 401 refreshes + replays (HOU-687). Shared by
   *  `engine` and the SDK, so `x-houston-org` has one live source
   *  (`setActiveOrg` mutates `_cp` in place; both re-read it). Rebuilt only by
   *  `setEndpoint`, which keeps its fallback bearer current. */
  authFetch: typeof fetch;
  /**
   * Memo for `deploymentServes()` (host-capabilities.ts): the deployment's
   * advertised capabilities, fetched once per endpoint. `null` = probe failed.
   */
  deploymentCaps: Promise<Capabilities | null> | undefined;
  /** Non-null in cloud mode: agents + chat go through the control plane. */
  private readonly _cp: ControlPlaneConfig | null;

  constructor(opts: HoustonClientOptions) {
    super();
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.token = opts.token;
    const useCp =
      opts.controlPlane ??
      (typeof window !== "undefined" &&
        !!(window as { __HOUSTON_CP__?: boolean }).__HOUSTON_CP__);
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
    // rides the SAME `authFetch`, so bearer/401-refresh/active-space match,
    // under the SAME read retry (`createEngineSdk` wraps it).
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
   * The SDK addressed at one space instead of the active one: a call about a
   * space the user is not standing in (a folder move's destination) carries
   * that space's `x-houston-org`. `null` is the personal space. Off-cloud there
   * is one space, so it is the shared {@link sdk}.
   */
  sdkForSpace(orgSlug: string | null): HoustonSdk {
    if (!this._cp || orgSlug === (this._cp.activeOrgSlug ?? null))
      return this.sdk;
    return createEngineSdk({
      baseUrl: this.baseUrl,
      fetch: gatewayAuthFetch(this.token, () => orgSlug),
    });
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
    this.forgetAgentList();
  }

  /** The one config both deployments share: the gateway in cloud mode, the
   *  local/self-host host otherwise — each serves `/v1/preferences/:key`. */
  prefConfig(): ControlPlaneConfig {
    return this._cp ?? { baseUrl: this.baseUrl, token: this.token };
  }
}
