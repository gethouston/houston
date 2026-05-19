import type { Agent } from "./types";

/**
 * The order agents appear in the sidebar (newest activity first).
 * Sidebar rendering and ⌘[ / ⌘] cycling both read from this so the
 * keyboard order matches what the user sees.
 */
export function orderAgents(agents: Agent[]): Agent[] {
  return [...agents].sort((a, b) => {
    const aTime = a.lastOpenedAt ?? a.createdAt;
    const bTime = b.lastOpenedAt ?? b.createdAt;
    return bTime.localeCompare(aTime);
  });
}
