import { iconUrlOf } from "./icon";
import type {
  CustomAuthMethod,
  CustomIntegrationDef,
  CustomIntegrationState,
  CustomIntegrationView,
} from "./types";

export function displayUrlOf(def: CustomIntegrationDef): string | undefined {
  if (def.kind === "mcp") return def.endpoint;
  return def.spec.kind === "url" ? def.spec.url : undefined;
}

export function viewOf(
  def: CustomIntegrationDef,
  state: CustomIntegrationState,
  authMethods: CustomAuthMethod[],
): CustomIntegrationView {
  const displayUrl = displayUrlOf(def);
  const iconUrl = iconUrlOf(def);
  return {
    slug: def.slug,
    name: def.name,
    ...(def.website ? { website: def.website } : {}),
    kind: def.kind,
    auth: def.auth,
    ...(displayUrl ? { displayUrl } : {}),
    ...(iconUrl ? { iconUrl } : {}),
    addedAtMs: def.addedAtMs,
    state,
    authMethods,
  };
}
