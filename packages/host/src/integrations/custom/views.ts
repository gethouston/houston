import { iconUrlOf } from "./icon";
import type {
  CustomAuthMethod,
  CustomIntegrationDef,
  CustomIntegrationState,
  CustomIntegrationView,
} from "./types";

/** The service URL the user recognizes: the spec URL / the MCP endpoint. An
 *  inline (blob) spec has no URL to show. */
export function displayUrlOf(def: CustomIntegrationDef): string | undefined {
  if (def.kind === "mcp") return def.endpoint;
  return def.spec.kind === "url" ? def.spec.url : undefined;
}

/** Assemble the route/UI view of one definition + its live state. */
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
    kind: def.kind,
    auth: def.auth,
    ...(displayUrl ? { displayUrl } : {}),
    ...(iconUrl ? { iconUrl } : {}),
    addedAtMs: def.addedAtMs,
    state,
    authMethods,
  };
}
