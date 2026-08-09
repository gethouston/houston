import type { SidebarGroup, SidebarLayout } from "@houston-ai/engine-client";

/**
 * Coercing an UNTRUSTED layout into one the rail can render, kept apart from
 * the ops that transform a layout the client already trusts. Every client read
 * of `sidebar_layout` comes through here first.
 */

/** The layout an unset/corrupt `sidebar_layout` preference reads as. */
export const DEFAULT_SIDEBAR_LAYOUT: SidebarLayout = {
  groups: [],
  ungroupedOrder: [],
};

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

/**
 * Coerce an untrusted value (a query-cache read, a server payload, a
 * cross-version or partially-written layout) into a guaranteed-complete
 * `SidebarLayout`. Any missing/wrong-typed field falls back to its default and
 * malformed groups are dropped, so the sidebar can NEVER crash on a bad layout
 * (`layout.groups.map` was blowing up when a non-layout value slipped through a
 * `?? DEFAULT` guard that only catches null/undefined, not a truthy partial).
 * Every client read of the layout goes through this.
 */
export function normalizeSidebarLayout(raw: unknown): SidebarLayout {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return DEFAULT_SIDEBAR_LAYOUT;
  }
  const r = raw as Record<string, unknown>;
  const groups: SidebarGroup[] = Array.isArray(r.groups)
    ? r.groups.flatMap((g) => {
        if (!g || typeof g !== "object" || Array.isArray(g)) return [];
        const gr = g as Record<string, unknown>;
        if (
          typeof gr.id !== "string" ||
          typeof gr.name !== "string" ||
          typeof gr.collapsed !== "boolean" ||
          !isStringArray(gr.agentIds) ||
          (gr.context !== undefined && typeof gr.context !== "string")
        )
          return [];
        return [
          {
            id: gr.id,
            name: gr.name,
            collapsed: gr.collapsed,
            agentIds: gr.agentIds,
            ...(gr.context !== undefined ? { context: gr.context } : {}),
            // Lenient like `defaultCollapsed`: a wrong-typed identity falls
            // back to ABSENT (never `""`), because unset means "render your own
            // default" while `""` would be an identity the user never chose.
            ...(typeof gr.icon === "string" ? { icon: gr.icon } : {}),
            ...(typeof gr.color === "string" ? { color: gr.color } : {}),
          },
        ];
      })
    : [];
  const ungroupedOrder = isStringArray(r.ungroupedOrder)
    ? r.ungroupedOrder
    : [];
  return {
    groups,
    ungroupedOrder,
    // Lenient like everything else here: a wrong-typed flag falls back to
    // ABSENT (not `false`), so the layout keeps reading as it always did.
    ...(typeof r.defaultCollapsed === "boolean"
      ? { defaultCollapsed: r.defaultCollapsed }
      : {}),
    // Same leniency for the default team's shared context: a wrong-typed value
    // reads ABSENT (not `""`), which is "nobody has written one" — the state
    // the layout has always had.
    ...(typeof r.defaultContext === "string"
      ? { defaultContext: r.defaultContext }
      : {}),
  };
}
