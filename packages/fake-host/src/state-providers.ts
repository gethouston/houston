/**
 * Stateful AI-provider credentials for the fake host — the per-agent-pod
 * provider model the SDK `providers` module and the hosted connect flow exercise
 * (PARITY-SETTINGS §2, §6). Credentials are PER AGENT in hosted mode, so state
 * is keyed by agent id; the flat `/providers` + `/auth/status` routes (the local
 * single-runtime profile) share the {@link FLAT_KEY} slot.
 *
 * Every slot seeds with Claude connected + active (what the old static
 * `providersBody`/`authStatusBody` returned, so the WebApp connect gate still
 * clears). Mutations — start/complete/cancel login, api-key, logout, settings —
 * flip the slot so a `GET /providers` + `GET /auth/status` refetch reflects them,
 * exactly as the real runtime does.
 *
 * Wire types come from the real packages so a contract change breaks the
 * typecheck here instead of silently drifting the mock.
 */

import type {
  AuthStatus,
  LoginInfo,
  LoginState,
  ProviderAuth,
  ProviderId,
  ProviderInfo,
  Settings,
} from "@houston/runtime-client";
import { CATALOG, SPEC } from "./provider-catalog";

/** The slot the flat (non-agent) `/providers` + `/auth/status` routes read. */
export const FLAT_KEY = "__flat__";

/** The hidden setup runtime's provider slot (`/setup-runtime/providers`):
 *  first-run truth, NOTHING connected — onboarding's connect step renders a
 *  Connect pill per provider (onboarding-connect.spec). Seeds EMPTY, unlike
 *  every other slot. The gate's `/setup-runtime/auth/status` keeps reading the
 *  connected {@link FLAT_KEY} slot so the rest of the suite boots to the shell. */
export const SETUP_KEY = "__setup__";

interface Slot {
  configured: Set<ProviderId>;
  login: Map<ProviderId, LoginState>;
  activeProvider: ProviderId | null;
  activeModel: Map<ProviderId, string>;
  enterpriseUrl: Map<ProviderId, string>;
  effort?: string;
}

function seedSlot(): Slot {
  return {
    configured: new Set<ProviderId>(["anthropic"]),
    login: new Map(),
    activeProvider: "anthropic",
    activeModel: new Map([["anthropic", "claude-sonnet-4-6"]]),
    enterpriseUrl: new Map(),
  };
}

let slots = new Map<string, Slot>();

/** The setup slot's seed: a first-run runtime holds no credentials. */
function emptySlot(): Slot {
  return {
    configured: new Set<ProviderId>(),
    login: new Map(),
    activeProvider: null,
    activeModel: new Map(),
    enterpriseUrl: new Map(),
  };
}

function slot(agentId: string): Slot {
  let s = slots.get(agentId);
  if (!s) {
    s = agentId === SETUP_KEY ? emptySlot() : seedSlot();
    slots.set(agentId, s);
  }
  return s;
}

/** Restore the seed. Wired into the store's `reset()`. */
export function resetProviders(): void {
  slots = new Map();
}

/** `GET /providers` (or `/agents/:id/providers`) → the rich `ProviderInfo[]`. */
export function providerList(agentId: string): ProviderInfo[] {
  const s = slot(agentId);
  return CATALOG.map((spec) => ({
    id: spec.id,
    name: spec.name,
    configured: s.configured.has(spec.id),
    isActive: s.activeProvider === spec.id,
    activeModel: s.activeModel.get(spec.id) ?? spec.models[0],
    models: spec.models,
  }));
}

/** `GET /auth/status` (or `/agents/:id/auth/status`) → the credential/login view. */
export function authStatusFor(agentId: string): AuthStatus {
  const s = slot(agentId);
  const providers: ProviderAuth[] = CATALOG.map((spec) => {
    const entry: ProviderAuth = {
      provider: spec.id,
      name: spec.name,
      configured: s.configured.has(spec.id),
      login: s.login.get(spec.id) ?? null,
    };
    const ent = s.enterpriseUrl.get(spec.id);
    if (spec.id === "github-copilot") entry.enterpriseUrl = ent ?? null;
    return entry;
  });
  return { providers, activeProvider: s.activeProvider };
}

/** Start an OAuth login: records the awaiting-user state, returns the kind the
 *  provider uses. `enterpriseDomain` (Copilot) is remembered for the credential. */
export function startLogin(
  agentId: string,
  provider: ProviderId,
  enterpriseDomain?: string,
): LoginInfo {
  const spec = SPEC.get(provider);
  const info: LoginInfo =
    spec?.loginKind === "auth_code"
      ? {
          kind: "auth_code",
          url: `https://connect.test/${provider}`,
          instructions: "Paste the code shown after you approve.",
        }
      : {
          kind: "device_code",
          verificationUri: `https://connect.test/${provider}/device`,
          userCode: "WXYZ-1234",
        };
  slot(agentId).login.set(provider, { status: "awaiting_user", info });
  if (enterpriseDomain)
    slot(agentId).enterpriseUrl.set(provider, enterpriseDomain);
  return info;
}

export function cancelLogin(agentId: string, provider: ProviderId): void {
  slot(agentId).login.delete(provider);
}

/** Mark a provider connected + clear its login; adopt it as active if none. */
function connect(s: Slot, provider: ProviderId): void {
  s.configured.add(provider);
  s.login.delete(provider);
  if (s.activeProvider === null) {
    s.activeProvider = provider;
    if (!s.activeModel.has(provider))
      s.activeModel.set(provider, SPEC.get(provider)?.models[0] ?? "");
  }
}

export function completeLogin(agentId: string, provider: ProviderId): void {
  connect(slot(agentId), provider);
}

export function setApiKey(agentId: string, provider: ProviderId): void {
  connect(slot(agentId), provider);
}

/** Disconnect a provider; if it was active, fall back to another connected one. */
export function logout(agentId: string, provider: ProviderId): void {
  const s = slot(agentId);
  s.configured.delete(provider);
  s.login.delete(provider);
  s.activeModel.delete(provider);
  if (s.activeProvider === provider)
    s.activeProvider = [...s.configured][0] ?? null;
}

/** `PUT /settings` — apply an active-provider / model / effort switch. */
export function setSettings(
  agentId: string,
  input: { activeProvider?: ProviderId; model?: string; effort?: string },
): Settings {
  const s = slot(agentId);
  if (input.activeProvider) s.activeProvider = input.activeProvider;
  if (input.model && s.activeProvider)
    s.activeModel.set(s.activeProvider, input.model);
  if (input.effort !== undefined) s.effort = input.effort;
  const models: Partial<Record<ProviderId, string>> = {};
  for (const [id, model] of s.activeModel) models[id] = model;
  return {
    ...(s.activeProvider ? { activeProvider: s.activeProvider } : {}),
    models,
    ...(s.effort !== undefined ? { effort: s.effort } : {}),
  };
}
