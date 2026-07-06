/**
 * Coherent merge of the runtime's two provider reads into the
 * `providers/<agentId>` view-model.
 *
 * `GET /providers` (`ProviderInfo[]`) is the rich base — it carries each
 * provider's models + active model + availability. `GET /auth/status`
 * (`AuthStatus`) overlays the credential/login truth: `configured`, the
 * in-flight `login` state, the Copilot `enterpriseUrl`, and the runtime's
 * `activeProvider`. The two lists come from the SAME per-agent runtime, so they
 * describe one set of providers; we union by id (list order first, any
 * auth-only providers appended) so nothing the wire reported is dropped.
 *
 * `configured` prefers the auth-status value (the credential source of truth the
 * login poll reads) and falls back to the list's flag; `isActive` is COMPUTED as
 * `id === activeProvider` so the snapshot is always internally consistent rather
 * than echoing the list's possibly-stale flag.
 */

import type {
  AuthStatus,
  ProviderAuth,
  ProviderId,
  ProviderInfo,
} from "@houston/runtime-client";
import type { ProvidersViewModel, ProviderVM } from "./types";

/** The `ProviderInfo` fields the merge reads. A prior {@link ProviderVM}
 *  structurally satisfies this, so a status-only overlay can reuse it as the
 *  model-carrying base. */
type ProviderInfoLike = Pick<
  ProviderInfo,
  "id" | "name" | "activeModel" | "models" | "configured"
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
  if (auth) vm.login = auth.login;
  if (auth?.enterpriseUrl !== undefined) vm.enterpriseUrl = auth.enterpriseUrl;
  return vm;
}

/** Build the VM from a model-carrying base list + the auth overlay, unioned by
 *  id (base order first, auth-only ids appended). */
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

/** Full merge of `GET /providers` + `GET /auth/status`. */
export function mergeProviders(
  infos: ProviderInfo[],
  auth: AuthStatus,
): ProvidersViewModel {
  return build(infos, auth);
}

/**
 * Status-only overlay for the cheap login poll: keep the model info the prior
 * snapshot already holds, refresh every credential/login/active field from
 * `GET /auth/status`. With no prior snapshot it degrades to an auth-only VM
 * (empty model lists) so a first poll before any full refresh still publishes.
 */
export function overlayStatus(
  prior: ProvidersViewModel | undefined,
  auth: AuthStatus,
): ProvidersViewModel {
  return build(prior?.providers ?? [], auth);
}
