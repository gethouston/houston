/** Standard tab set every agent shows. */

import type { Agent, Capabilities } from "@houston-ai/engine-client";
import { isAgentManager } from "../lib/agent-access.ts";
import { isMultiplayer } from "../lib/org-roles.ts";

export interface AgentTab {
  /** Tab identifier (also matches the built-in component key in tab-resolver). */
  id: string;
  /** Display label fallback when no i18n key is available. */
  label: string;
  /** Built-in component key consumed by tab-resolver. */
  builtIn: string;
  /** Badge source: "activity" shows count of items needing attention. */
  badge?: "activity";
}

export const STANDARD_TABS: AgentTab[] = [
  { id: "activity", label: "Activity", builtIn: "board", badge: "activity" },
  { id: "context", label: "Context", builtIn: "context" },
  { id: "skills", label: "Skills", builtIn: "skills" },
  { id: "integrations", label: "Integrations", builtIn: "integrations" },
  { id: "routines", label: "Routines", builtIn: "routines" },
  { id: "files", label: "Files", builtIn: "files" },
  { id: "admin", label: "Admin", builtIn: "admin" },
];

export const DEFAULT_TAB_ID = "activity";

export const STANDARD_TAB_IDS: ReadonlySet<string> = new Set(
  STANDARD_TABS.map((tab) => tab.id),
);

/**
 * The tabs a caller may see on an agent (PRODUCT-1256 split the old Settings
 * tab into Context / Skills / Admin):
 *
 * - **Context** (job description + learnings) keeps the old Settings tab's
 *   visibility rule: everyone on a Teams host (members read it read-only),
 *   otherwise the agent manager only.
 * - **Skills** is manager-only: the surface is an editor with no read-only
 *   mode, and members never saw the configuration rows before the split.
 * - **Admin** (people / apps / models) is for the workspace owner and agent
 *   managers only, and only exists in multiplayer: single-player has no
 *   access rows, so the tab would be empty there.
 */
export function visibleAgentTabs(
  caps: Capabilities | null | undefined,
  agent: Pick<Agent, "access">,
): AgentTab[] {
  // Check manager membership against the caller-visible agent record. The
  // gateway already resolved `access` for this caller, so never infer it from
  // organization role or a broader agent list.
  const manager = isAgentManager(caps, agent);
  return STANDARD_TABS.filter((tab) => {
    if (tab.id === "context") {
      return caps?.teams === true || !isMultiplayer(caps) || manager;
    }
    if (tab.id === "skills") return manager;
    if (tab.id === "admin") return manager && isMultiplayer(caps);
    return true;
  });
}

/** Whether `tabId` is a tab the caller may actually see on this agent. */
export function isVisibleAgentTab(
  caps: Capabilities | null | undefined,
  agent: Pick<Agent, "access">,
  tabId: string,
): boolean {
  return visibleAgentTabs(caps, agent).some((tab) => tab.id === tabId);
}

/** Returns a visible tab id, falling back to Activity for stale routes. */
export function agentTabFallback(
  caps: Capabilities | null | undefined,
  agent: Pick<Agent, "access">,
  tabId: string,
): string {
  return isVisibleAgentTab(caps, agent, tabId) ? tabId : DEFAULT_TAB_ID;
}
