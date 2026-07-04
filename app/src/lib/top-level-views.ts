/**
 * The non-agent, top-level views: full-window surfaces reached from the sidebar
 * rather than from an agent's tab bar. `workspace-shell.tsx` renders each one
 * and treats every other `viewMode` as an agent tab; `sidebar.tsx` highlights
 * the matching nav item. Both predicates source from this one set so a new
 * top-level view (like the AI hub) can't be added to one and forgotten in the
 * other.
 */
export const TOP_LEVEL_VIEWS = new Set<string>([
  "dashboard",
  "settings",
  "ai-hub",
]);

/** Whether a `viewMode` is a top-level (non-agent) view. */
export function isTopLevelView(viewMode: string): boolean {
  return TOP_LEVEL_VIEWS.has(viewMode);
}
