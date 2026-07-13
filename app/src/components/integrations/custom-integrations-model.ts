import type {
  CustomAuthMethod,
  CustomIntegrationView,
} from "@houston-ai/engine-client";

/** The i18n badge key for a custom integration's connection type. User-facing
 *  copy says "API" / "MCP server", never "OpenAPI" / "MCP" bare. */
export function customKindBadgeKey(
  kind: CustomIntegrationView["kind"],
): "custom.badge.api" | "custom.badge.mcp" {
  return kind === "openapi" ? "custom.badge.api" : "custom.badge.mcp";
}

/** The auth method to (re)provide a secret through: the view's top-level
 *  `authMethods` if present, else the `pending` state's list, else `null`
 *  (nothing to collect yet — the caller shows a single fallback field). */
export function customAuthMethod(
  view: Pick<CustomIntegrationView, "authMethods" | "state">,
): CustomAuthMethod | null {
  if (view.authMethods && view.authMethods.length > 0)
    return view.authMethods[0];
  if (view.state.status === "pending" && view.state.authMethods.length > 0)
    return view.state.authMethods[0];
  return null;
}

/** Whether the integration is waiting on a secret before any tool exists. */
export function isPendingCredential(view: CustomIntegrationView): boolean {
  return view.state.status === "pending";
}

/**
 * The custom-integrations list narrowed by the tab's search field: a
 * case-insensitive substring over name and slug (there is no description or
 * category on a custom integration). A blank query keeps everything.
 */
export function filterCustomIntegrations(
  items: CustomIntegrationView[],
  query: string,
): CustomIntegrationView[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (i) => i.name.toLowerCase().includes(q) || i.slug.toLowerCase().includes(q),
  );
}
