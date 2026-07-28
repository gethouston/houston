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
  { id: "job-description", label: "Settings", builtIn: "job-description" },
  { id: "integrations", label: "Integrations", builtIn: "integrations" },
  { id: "routines", label: "Routines", builtIn: "routines" },
  { id: "files", label: "Files", builtIn: "files" },
];

export const DEFAULT_TAB_ID = "activity";

export const STANDARD_TAB_IDS: ReadonlySet<string> = new Set(
  STANDARD_TABS.map((tab) => tab.id),
);

/**
 * The tabs a caller may see on an agent. Settings is visible to everyone on a
 * Teams host so members can inspect access policy read-only. Outside Teams it
 * remains limited to the agent manager, as before.
 */
export function visibleAgentTabs(
  caps: Capabilities | null | undefined,
  agent: Pick<Agent, "access">,
): AgentTab[] {
  // Check manager membership against the caller-visible agent record. The
  // gateway already resolved `access` for this caller, so never infer it from
  // organization role or a broader agent list.
  return STANDARD_TABS.filter(
    (tab) =>
      tab.id !== "job-description" ||
      caps?.teams === true ||
      !isMultiplayer(caps) ||
      isAgentManager(caps, agent),
  );
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
