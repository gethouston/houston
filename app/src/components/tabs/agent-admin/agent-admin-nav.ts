import type { Capabilities } from "@houston-ai/engine-client";
import { isMultiplayer } from "../../../lib/org-roles.ts";
import type { Agent } from "../../../lib/types";

/**
 * The sections the Agent Settings tab can show. Each nav item in
 * the settings rail maps 1:1 to a section, and the two-column layout keeps one
 * always selected. Name / color / delete are NOT sections: those three actions
 * live on the sidebar agent row, so there is no "general" or "template" concept
 * here. Pure, DOM-free so the group/row visibility is unit-tested.
 */
export type AgentAdminScreen =
  | "instructions"
  | "skills"
  | "knowledge"
  | "people"
  | "integrations"
  | "model";

/** Shared props for every Agent Settings section component. */
export interface AgentAdminScreenProps {
  agent: Agent;
}

export type AgentAdminCardId = "configuration" | "access";

export interface AgentAdminCard {
  id: AgentAdminCardId;
  rows: AgentAdminScreen[];
}

/**
 * Which grouped nav sections + rows the Agent Settings rail shows for this
 * caller.
 *
 * - **Configuration** (managers): instructions, skills, knowledge.
 * - **Access** (multiplayer): people with access, plus allowed apps and models
 *   when the host supports Teams policy ceilings.
 * The public-API "Connect" card (C10, `capabilities.apiKeys`) was removed from
 * this screen (HOU-806): connecting external apps is a Routines concern now.
 * The underlying model (`lib/agent-connect-model.ts`) and Settings > API keys
 * stay.
 *
 * Single-player / self-host gets Configuration only. A Teams member sees Access
 * only, read-only, matching the old member-facing Permissions surface.
 */
export function agentAdminCards(
  caps: Capabilities | null | undefined,
  readOnly = false,
): AgentAdminCard[] {
  const cards: AgentAdminCard[] = readOnly
    ? []
    : [
        {
          id: "configuration",
          rows: ["instructions", "skills", "knowledge"],
        },
      ];

  if (isMultiplayer(caps)) {
    cards.push({
      id: "access",
      rows:
        caps?.teams === true ? ["people", "integrations", "model"] : ["people"],
    });
  }

  return cards;
}

/**
 * Deep-link from a turn-summary file target (a semantic file update the agent
 * wrote) into the matching section. Learnings surface as "Memory".
 */
export function targetToScreen(
  target: "instructions" | "skills" | "learnings",
): AgentAdminScreen {
  return target === "learnings" ? "knowledge" : target;
}
