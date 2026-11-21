import type {
  AuthStatus,
  LoginInfo,
  LoginState,
  ProviderAuth,
  ProviderId,
  ProviderInfo,
  ProviderUsage,
  Settings,
} from "@houston/runtime-client";
import { CATALOG, SPEC } from "./provider-catalog";

export const FLAT_KEY = "__flat__";

interface Slot {
  configured: Set<ProviderId>;
  login: Map<ProviderId, LoginState>;
  activeProvider: ProviderId | null;
  activeModel: Map<ProviderId, string>;
  enterpriseUrl: Map<ProviderId, string>;
  effort?: string;
}

function seedSlot(connected: boolean): Slot {
  return {
    configured: new Set<ProviderId>(connected ? ["anthropic"] : []),
    login: new Map(),
    activeProvider: connected ? "anthropic" : null,
    activeModel: new Map<ProviderId, string>(
      connected ? [["anthropic", "claude-sonnet-4-6"]] : [],
    ),
    enterpriseUrl: new Map(),
  };
}

let slots = new Map<string, Slot>();

let providerUsageSeed: ProviderUsage[] | null = null;

function seedProviderUsage(): ProviderUsage[] {
  const inHours = (h: number) =>
    new Date(Date.now() + h * 3_600_000).toISOString();
  return [
    {
      provider: "anthropic",
      status: "ok",
      plan: "max",
      windows: [
        { id: "session", usedPercent: 42, resetsAt: inHours(3) },
        { id: "week", usedPercent: 12, resetsAt: inHours(96) },
      ],
      fetchedAt: new Date().toISOString(),
    },
  ];
}

function slot(agentId: string): Slot {
  let s = slots.get(agentId);
  if (!s) {
    s = seedSlot(agentId !== FLAT_KEY);
    slots.set(agentId, s);
  }
  return s;
}

export function resetProviders(): void {
  slots = new Map();
  providerUsageSeed = null;
}

export function providerUsageList(): ProviderUsage[] {
  return providerUsageSeed ?? seedProviderUsage();
}

export function setProviderUsage(
  rows: ProviderUsage[] | null,
): ProviderUsage[] {
  providerUsageSeed = rows;
  return providerUsageList();
}

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

export function logout(agentId: string, provider: ProviderId): void {
  const s = slot(agentId);
  s.configured.delete(provider);
  s.login.delete(provider);
  s.activeModel.delete(provider);
  if (s.activeProvider === provider)
    s.activeProvider = [...s.configured][0] ?? null;
}

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
