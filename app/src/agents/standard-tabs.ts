/**
 * Standard tab set every agent shows.
 *
 * Agents used to declare their own tabs in houston.json, but that flexibility
 * was never used in practice (zero agents shipped a custom React tab) and
 * caused drift between installed agents and freshly-installed ones. There's
 * now one canonical set, hardcoded here.
 */

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
  { id: "routines", label: "Routines", builtIn: "routines" },
  // Reactions (event-driven automations, C9) sit beside Routines but are shown
  // only where the deployment supports event triggers — see visibleAgentTabs.
  { id: "reactions", label: "Reactions", builtIn: "reactions" },
  // Integrations (Composio, platform mode) are served by the Houston host's
  // /v1/integrations routes — present in every build.
  { id: "integrations", label: "Integrations", builtIn: "integrations" },
  { id: "files", label: "Files", builtIn: "files" },
  { id: "archived", label: "Archived", builtIn: "archived" },
  // Agent Settings is the manager/owner-only admin surface, pinned to the far
  // right (after Archived) and hidden from plain members — see visibleAgentTabs.
  {
    id: "job-description",
    label: "Agent Settings",
    builtIn: "job-description",
  },
];

export const DEFAULT_TAB_ID = "activity";

export const STANDARD_TAB_IDS: ReadonlySet<string> = new Set(
  STANDARD_TABS.map((tab) => tab.id),
);

/**
 * The tabs a given caller may see on a specific agent. Everyone sees Activity /
 * Routines / Integrations / Files / Archived. Reactions (event-driven
 * automations) is added only where the deployment supports event triggers
 * (`capabilities.triggers`). The Agent Settings (`job-description`) admin surface
 * is added only for callers who may configure the agent — single-player (the
 * sole user owns everything) or an org agent-manager/owner. A plain org member
 * never gets it (Teams matrix v2). The gateway is the real enforcer; this only
 * hides an affordance a member can't act on. Pure and DOM-free so the visibility
 * rule is unit-tested in isolation.
 */
export function visibleAgentTabs(
  caps: Capabilities | null | undefined,
  agent: Pick<Agent, "access">,
): AgentTab[] {
  return STANDARD_TABS.filter((tab) => {
    if (tab.id === "reactions") return !!caps?.triggers;
    if (tab.id === "job-description") {
      return !isMultiplayer(caps) || isAgentManager(caps, agent);
    }
    return true;
  });
}

/**
 * Whether `tabId` is a tab the given caller may actually see on this agent.
 * Membership must be checked against the caller-visible set, NOT the raw
 * `STANDARD_TAB_IDS`: `job-description` lives in the standard set but is hidden
 * from plain members, so a `STANDARD_TAB_IDS` check would treat a member's
 * `viewMode="job-description"` as valid and strand them on a blank pane.
 */
export function isVisibleAgentTab(
  caps: Capabilities | null | undefined,
  agent: Pick<Agent, "access">,
  tabId: string,
): boolean {
  return visibleAgentTabs(caps, agent).some((tab) => tab.id === tabId);
}

/**
 * `tabId` if the caller may see it on this agent, otherwise the default tab.
 * Use for viewMode redirects and tour navigation so a hidden tab (e.g. Agent
 * Settings for a member) falls back to a real, rendered tab instead of a blank
 * pane.
 */
export function agentTabFallback(
  caps: Capabilities | null | undefined,
  agent: Pick<Agent, "access">,
  tabId: string,
): string {
  return isVisibleAgentTab(caps, agent, tabId) ? tabId : DEFAULT_TAB_ID;
}
