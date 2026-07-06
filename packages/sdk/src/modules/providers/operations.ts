/**
 * The providers module's operations — the read/merge + credential-mutation
 * functions the typed facade and the bridge command handlers both call. Kept out
 * of `index.ts` so the factory there stays a thin wiring layer.
 *
 * Every call is routed through `ctx.clientFor(agentId)` (`/agents/<id>/…`, the
 * per-agent-pod credential scope). Writes mutate then refetch, so the published
 * snapshot always reflects the runtime. See `index.ts` for the login-polling
 * contract (the SURFACE polls {@link ProviderOps.refreshStatus}; the SDK owns no
 * timer) and the 401 seam (the shared auth-fetch surfaces it automatically).
 */

import type { ModuleContext } from "../../module-context";
import { resolveModelSettings } from "../turns/model-settings";
import { mergeProviders, overlayStatus } from "./merge";
import {
  type LoginInfo,
  type LoginOptions,
  type ProviderId,
  type ProvidersViewModel,
  providersScope,
  type SetModelOptions,
} from "./types";

export interface ProviderOps {
  refresh(agentId: string): Promise<void>;
  refreshStatus(agentId: string): Promise<void>;
  login(
    agentId: string,
    provider: ProviderId,
    opts?: LoginOptions,
  ): Promise<LoginInfo>;
  cancelLogin(agentId: string, provider: ProviderId): Promise<void>;
  completeLogin(
    agentId: string,
    provider: ProviderId,
    code: string,
  ): Promise<void>;
  setApiKey(agentId: string, provider: ProviderId, key: string): Promise<void>;
  logout(agentId: string, provider: ProviderId): Promise<void>;
  setModel(agentId: string, opts: SetModelOptions): Promise<void>;
}

export function createProviderOps(ctx: ModuleContext): ProviderOps {
  const { store } = ctx;

  // Monotonic per-agent request sequence: a slow full refresh that resolves
  // after a newer one never flushes a stale snapshot over the fresh one
  // (last-intent wins). Mirrors the activities module's guard.
  const loadSeq = new Map<string, number>();

  async function refresh(agentId: string): Promise<void> {
    const scope = providersScope(agentId);
    const seq = (loadSeq.get(agentId) ?? 0) + 1;
    loadSeq.set(agentId, seq);
    // Signal loading while keeping any prior providers to avoid a flush-to-empty.
    const prior = store.getSnapshot(scope) as ProvidersViewModel | undefined;
    store.publish(scope, {
      loaded: false,
      providers: prior?.providers ?? [],
      ...(prior?.activeProvider
        ? { activeProvider: prior.activeProvider }
        : {}),
    });
    const client = ctx.clientFor(agentId);
    const [infos, auth] = await Promise.all([
      client.listProviders(),
      client.authStatus(),
    ]);
    if (loadSeq.get(agentId) === seq)
      store.publish(scope, mergeProviders(infos, auth));
  }

  async function refreshStatus(agentId: string): Promise<void> {
    const auth = await ctx.clientFor(agentId).authStatus();
    const scope = providersScope(agentId);
    const prior = store.getSnapshot(scope) as ProvidersViewModel | undefined;
    store.publish(scope, overlayStatus(prior, auth));
  }

  async function login(
    agentId: string,
    provider: ProviderId,
    opts?: LoginOptions,
  ): Promise<LoginInfo> {
    const info = await ctx
      .clientFor(agentId)
      .startLogin(provider, opts?.deviceAuth ?? true, opts?.enterpriseDomain);
    // Reflect the now-awaiting login state so a surface can paint "Connecting…"
    // — best-effort: the login already started, so a status hiccup must not mask
    // the LoginInfo the user needs to proceed.
    try {
      await refreshStatus(agentId);
    } catch (err) {
      ctx.config.ports.logger.debug(
        "providers refreshStatus after login failed",
        { error: String(err), agentId },
      );
    }
    return info;
  }

  async function cancelLogin(
    agentId: string,
    provider: ProviderId,
  ): Promise<void> {
    await ctx.clientFor(agentId).cancelLogin(provider);
    await refreshStatus(agentId);
  }

  async function completeLogin(
    agentId: string,
    provider: ProviderId,
    code: string,
  ): Promise<void> {
    await ctx.clientFor(agentId).completeLogin(provider, code);
    await refresh(agentId);
  }

  async function setApiKey(
    agentId: string,
    provider: ProviderId,
    key: string,
  ): Promise<void> {
    await ctx.clientFor(agentId).setApiKey(provider, key);
    await refresh(agentId);
  }

  async function logout(agentId: string, provider: ProviderId): Promise<void> {
    await ctx.clientFor(agentId).logout(provider);
    await refresh(agentId);
  }

  async function setModel(
    agentId: string,
    opts: SetModelOptions,
  ): Promise<void> {
    const client = ctx.clientFor(agentId);
    // Reuse the shared resolver: it pairs a model with its owning provider (the
    // runtime hard-fails a model that belongs to a different active provider).
    const settings = await resolveModelSettings(
      client,
      opts.model,
      opts.effort,
    );
    if (opts.provider !== undefined) settings.activeProvider = opts.provider;
    await client.setSettings(settings);
    await refresh(agentId);
  }

  return {
    refresh,
    refreshStatus,
    login,
    cancelLogin,
    completeLogin,
    setApiKey,
    logout,
    setModel,
  };
}
