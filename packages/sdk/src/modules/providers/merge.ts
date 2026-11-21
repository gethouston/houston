import type {
  AuthStatus,
  ProviderAuth,
  ProviderId,
  ProviderInfo,
} from "@houston/runtime-client";
import type { ProvidersViewModel, ProviderVM } from "./types";

type ProviderInfoLike = Pick<
  ProviderInfo,
  "id" | "name" | "activeModel" | "models" | "configured" | "reconnectBy"
>;

function toVM(
  activeProvider: ProviderId | null,
  id: ProviderId,
  info: ProviderInfoLike | undefined,
  auth: ProviderAuth | undefined,
): ProviderVM {
  const vm: ProviderVM = {
    id,
    name: info?.name ?? auth?.name ?? id,
    configured: auth?.configured ?? info?.configured ?? false,
    isActive: activeProvider === id,
    activeModel: info?.activeModel ?? "",
    models: info?.models ?? [],
  };
  if (info?.reconnectBy !== undefined) vm.reconnectBy = info.reconnectBy;
  if (auth) vm.login = auth.login;
  if (auth?.enterpriseUrl !== undefined) vm.enterpriseUrl = auth.enterpriseUrl;
  return vm;
}

function build(base: ProviderInfoLike[], auth: AuthStatus): ProvidersViewModel {
  const authById = new Map(auth.providers.map((a) => [a.provider, a]));
  const active = auth.activeProvider;
  const seen = new Set<ProviderId>();
  const providers: ProviderVM[] = [];
  for (const info of base) {
    seen.add(info.id);
    providers.push(toVM(active, info.id, info, authById.get(info.id)));
  }
  for (const a of auth.providers) {
    if (seen.has(a.provider)) continue;
    providers.push(toVM(active, a.provider, undefined, a));
  }
  return {
    loaded: true,
    providers,
    ...(active ? { activeProvider: active } : {}),
  };
}

export function mergeProviders(
  infos: ProviderInfo[],
  auth: AuthStatus,
): ProvidersViewModel {
  return build(infos, auth);
}

export function overlayStatus(
  prior: ProvidersViewModel | undefined,
  auth: AuthStatus,
): ProvidersViewModel {
  return build(prior?.providers ?? [], auth);
}

export function signInFinished(
  prior: ProvidersViewModel | undefined,
  next: ProvidersViewModel,
): boolean {
  const before = new Map(prior?.providers.map((p) => [p.id, p]));
  return next.providers.some((provider) => {
    const was = before.get(provider.id);
    if (!was) return false;
    const completed =
      provider.login?.status === "complete" && was.login?.status !== "complete";
    return completed || (provider.configured && !was.configured);
  });
}
