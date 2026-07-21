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

/**
 * The agent workspace Permissions tab id. Deliberately NOT "permissions": that
 * is the top-level view id (`PERMISSIONS_VIEW_ID`), and agent tab ids share the
 * `viewMode` string space with top-level view ids, so reusing it would shadow the
 * view. Kept lowercase + stable (a persisted `viewMode` value + the tour anchor).
 */
export const PERMISSIONS_TAB_ID = "agent-permissions";

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
  // Automations: everything the agent does on its own — on a cron schedule, or
  // (where the deployment supports event triggers, C9) the moment something
  // happens in a connected app. ONE tab for both; the wake mechanism is a
  // choice inside the editor, gated there by `capabilities.triggers`, so the
  // tab set never varies by deployment. The id stays "routines" — it's a
  // persisted viewMode value and the tour target.
  { id: "routines", label: "Routines", builtIn: "routines" },
  // Integrations (Composio, platform mode) are served by the Houston host's
  // /v1/integrations routes — present in every build.
  { id: "integrations", label: "Integrations", builtIn: "integrations" },
  { id: "files", label: "Files", builtIn: "files" },
  { id: "archived", label: "Archived", builtIn: "archived" },
  // Permissions: the People | Integrations | AI Models surface, mounted ON the
  // agent and visible to EVERYONE who can open it (read-only for non-managers).
  // Teams-only — hidden on single-player/self-host where there are no ceilings or
  // roster (see visibleAgentTabs). The id differs from the top-level Permissions
  // view id (`PERMISSIONS_VIEW_ID = "permissions"`), which shares the `viewMode`
  // string space, so it does not shadow it — mirrors "integrations" (tab) vs
  // "integrations-home" (view), but here the VIEW owns the short name.
  {
    id: PERMISSIONS_TAB_ID,
    label: "Permissions",
    builtIn: PERMISSIONS_TAB_ID,
  },
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
 * Automations / Integrations / Files / Archived. (Event triggers no longer add
 * a tab — the wake choice lives inside the Automations editor, gated there by
 * `capabilities.triggers`.) The Agent Settings (`job-description`) admin surface
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
    if (tab.id === "job-description") {
      return !isMultiplayer(caps) || isAgentManager(caps, agent);
    }
    // Permissions is Teams-only: on single-player/self-host there are no ceilings
    // or roster to show, so the tab never appears there. Everyone on a Teams host
    // sees it (read-only for non-managers) — the read/manage split is inside.
    if (tab.id === PERMISSIONS_TAB_ID) {
      return caps?.teams === true;
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
