/**
 * Wire + view-model types for the providers module — the per-agent AI-provider
 * connect/status surface (PARITY-SETTINGS §2, §6). Provider credentials are
 * per-agent-pod in hosted mode, so every scope, command, and call is keyed by
 * `agentId` and routed through `ctx.clientFor(agentId)` (`/agents/<id>/…`).
 *
 * The `providers/<agentId>` snapshot merges the runtime's two provider reads
 * coherently: `GET /providers` (the rich list — models + active model +
 * availability) is the base, and `GET /auth/status` overlays the credential
 * truth (`configured`), the in-flight `login` state, the Copilot Enterprise
 * `enterpriseUrl`, and the runtime's `activeProvider`. Everything here is plain
 * JSON — it crosses the `getSnapshot`/`subscribe`/`dispatch` boundary unchanged.
 *
 * Fields are exactly what the wire provides (`@houston/protocol` via
 * `@houston/runtime-client`); nothing is invented.
 */

import type {
  LoginInfo,
  LoginState,
  ProviderId,
} from "@houston/runtime-client";

export type { LoginInfo, LoginState, ProviderId };

/**
 * One provider inside the `providers/<agentId>` snapshot: the `ProviderInfo`
 * fields (`GET /providers`) enriched with the `GET /auth/status` overlay.
 *
 * `isActive` is computed as `id === activeProvider`, so it is always coherent
 * with the snapshot's top-level `activeProvider` (never a stale echo of the
 * runtime's own flag). `login` (present only when the provider appears in
 * `/auth/status`) carries the in-flight OAuth state a surface polls on;
 * `enterpriseUrl` distinguishes a Copilot Enterprise credential.
 */
export interface ProviderVM {
  id: ProviderId;
  name: string;
  /** Credential present (auth-status truth; falls back to the list's flag). */
  configured: boolean;
  /** `id === activeProvider` — the provider new turns run under. */
  isActive: boolean;
  /** The runtime's active model for this provider (may be empty pre-connect). */
  activeModel: string;
  /** The provider's selectable models (empty for an auth-only provider). */
  models: string[];
  /** In-flight/last OAuth login state, or null when idle. Absent when the
   *  provider isn't in `/auth/status`. The SURFACE polls this via
   *  {@link ProvidersModule.refreshStatus}; the SDK never hides a timer. */
  login?: LoginState | null;
  /** GitHub Copilot Enterprise domain the credential was issued for, else null.
   *  Absent for every non-Copilot provider. */
  enterpriseUrl?: string | null;
}

/**
 * The `providers/<agentId>` view-model: the WHOLE snapshot, republished on any
 * change. `loaded` is false until the first merge resolves; `activeProvider` is
 * omitted when the runtime has none selected.
 */
export interface ProvidersViewModel {
  loaded: boolean;
  providers: ProviderVM[];
  activeProvider?: ProviderId;
}

/** The reactive scope this module owns, per agent. */
export const providersScope = (agentId: string): string =>
  `providers/${agentId}`;

/** The command types this module registers. Typed to defeat string drift. */
export const ProvidersCommand = {
  Refresh: "providers/refresh",
  RefreshStatus: "providers/refreshStatus",
  Login: "providers/login",
  CancelLogin: "providers/cancelLogin",
  CompleteLogin: "providers/completeLogin",
  SetApiKey: "providers/setApiKey",
  Logout: "providers/logout",
  SetModel: "providers/setModel",
} as const;
export type ProvidersCommandType =
  (typeof ProvidersCommand)[keyof typeof ProvidersCommand];

/** Options for {@link ProvidersModule.login}. Hosted mode defaults `deviceAuth`
 *  true (no loopback callback); `enterpriseDomain` is GitHub Copilot only. */
export interface LoginOptions {
  deviceAuth?: boolean;
  enterpriseDomain?: string;
}

/** Options for {@link ProvidersModule.setModel}: a per-agent model/effort/
 *  provider switch, applied through the shared `resolveModelSettings` semantics. */
export interface SetModelOptions {
  model?: string;
  effort?: string;
  /** Explicit active-provider override (else resolved from the model's owner). */
  provider?: ProviderId;
}

/**
 * The typed facade for per-agent provider reads + writes.
 *
 * Every mutating call refreshes the agent's snapshot before it resolves, so a
 * caller that awaits it reads the settled VM. The login flow is the exception
 * to "refresh the whole VM": `login` starts an OAuth session and returns the
 * {@link LoginInfo} verbatim (the discriminated union the surface renders), then
 * the SURFACE polls {@link refreshStatus} (the cheap `/auth/status`-only read)
 * until `configured` flips — the SDK stays imperative and owns no timers.
 */
export interface ProvidersModule {
  /** Scope string for `sdk.subscribe(...)` / `sdk.getSnapshot(...)`. */
  scope(agentId: string): string;
  /** Full read: merge `GET /providers` + `GET /auth/status`, republish. */
  refresh(agentId: string): Promise<void>;
  /** Cheap poll: `GET /auth/status` only, overlaid onto the current snapshot.
   *  The login-polling read (`configured` flips here when a device/auth-code
   *  login completes). */
  refreshStatus(agentId: string): Promise<void>;
  /** Start an OAuth login; returns the {@link LoginInfo} to render (verbatim).
   *  Refreshes status (surfaces the awaiting-user state) before resolving. */
  login(
    agentId: string,
    provider: ProviderId,
    opts?: LoginOptions,
  ): Promise<LoginInfo>;
  /** Abort an in-flight login, then refresh status. */
  cancelLogin(agentId: string, provider: ProviderId): Promise<void>;
  /** Submit a pasted code (the `auth_code` path), then refresh. */
  completeLogin(
    agentId: string,
    provider: ProviderId,
    code: string,
  ): Promise<void>;
  /** Store an API key for an api-key provider, then refresh (configured flips). */
  setApiKey(agentId: string, provider: ProviderId, key: string): Promise<void>;
  /** Disconnect a provider, then refresh (configured flips off). */
  logout(agentId: string, provider: ProviderId): Promise<void>;
  /** Apply a model/effort/provider switch (resolveModelSettings), then refresh. */
  setModel(agentId: string, opts: SetModelOptions): Promise<void>;
}
