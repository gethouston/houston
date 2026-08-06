import type { Capabilities } from "@houston-ai/engine-client";
import { isMultiplayer } from "../../../lib/org-roles.ts";
import type { Agent } from "../../../lib/types";

/**
 * The sections the Context and Admin agent tabs can show (PRODUCT-1256 split
 * the old Settings tab; Skills became its own tab with no rail). Each nav item
 * in a tab's rail maps 1:1 to a section, and the two-column layout keeps one
 * always selected. Name / color / delete are NOT sections: those three actions
 * live on the sidebar agent row, so there is no "general" or "template" concept
 * here. Pure, DOM-free so the row visibility is unit-tested.
 */
export type AgentAdminScreen =
  | "instructions"
  | "knowledge"
  | "people"
  | "integrations"
  | "model";

/** Shared props for every Context / Skills / Admin section component. */
export interface AgentAdminScreenProps {
  agent: Agent;
}

/**
 * The Context tab's rows: the agent's job description (instructions) and its
 * learnings ("Memory"). Everyone who sees the tab sees both rows; non-managers
 * get them read-only.
 */
export function contextScreens(): AgentAdminScreen[] {
  return ["instructions", "knowledge"];
}

/**
 * The Admin tab's rows: people with access, plus allowed apps and models when
 * the host supports Teams policy ceilings. Empty outside multiplayer, which is
 * why single-player hides the Admin tab entirely.
 * The public-API "Connect" card (C10, `capabilities.apiKeys`) was removed from
 * this surface (HOU-806): connecting external apps is a Routines concern now.
 */
export function adminScreens(
  caps: Capabilities | null | undefined,
): AgentAdminScreen[] {
  if (!isMultiplayer(caps)) return [];
  return caps?.teams === true
    ? ["people", "integrations", "model"]
    : ["people"];
}

/**
 * Deep-link from a turn-summary file target (a semantic file update the agent
 * wrote) into the matching Context section. Learnings surface as "Memory".
 */
export function targetToScreen(
  target: "instructions" | "learnings",
): AgentAdminScreen {
  return target === "learnings" ? "knowledge" : target;
}
