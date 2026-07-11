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
  return {
    slug: def.slug,
    name: def.name,
    kind: def.kind,
    ...(displayUrlOf(def) ? { displayUrl: displayUrlOf(def) } : {}),
    addedAtMs: def.addedAtMs,
    state,
    authMethods,
  };
}
