import type { Agent, Capabilities } from "@houston-ai/engine-client";
import { isAgentManager, isMultiplayer } from "../../../lib/org-roles.ts";

/**
 * The full-pane screens the manager-only Agent Settings tab can drill into. Row
 * ids on the landing map 1:1 to a screen (the "general" card also carries a
 * "template" row). Pure, DOM-free so the card/row visibility is unit-tested.
 */
export type AgentAdminScreen =
  | "instructions"
  | "skills"
  | "knowledge"
  | "model"
  | "people"
  | "integrations"
  | "general"
  | "template";

export type AgentAdminCardId = "configuration" | "access" | "general";

export interface AgentAdminCard {
  id: AgentAdminCardId;
  rows: AgentAdminScreen[];
}

/**
 * Which grouped cards + rows the Agent Settings landing shows for this caller.
 *
 * - **Configuration** (always): instructions, skills, knowledge, AI model.
 * - **Access** (multiplayer only): people with access, allowed integrations.
 * - **General** (always): general details, plus "Save as template" only in
 *   multiplayer for an agent-manager.
 *
 * Single-player / self-host gets Configuration + General only — no Access card
 * and no template row. Only managers/owners (or the single-player sole user)
 * ever reach this tab, so everything here is editable; the gateway is the real
 * enforcer.
 */
export function agentAdminCards(
  caps: Capabilities | null | undefined,
  agent: Pick<Agent, "access">,
): AgentAdminCard[] {
  const multiplayer = isMultiplayer(caps);
  const manager = isAgentManager(caps, agent);

  const cards: AgentAdminCard[] = [
    {
      id: "configuration",
      rows: ["instructions", "skills", "knowledge", "model"],
    },
  ];

  if (multiplayer) {
    cards.push({ id: "access", rows: ["people", "integrations"] });
  }

  const general: AgentAdminScreen[] = ["general"];
  if (multiplayer && manager) general.push("template");
  cards.push({ id: "general", rows: general });

  return cards;
}

/**
 * Deep-link from a turn-summary file target (a semantic file update the agent
 * wrote) into the matching drill-in screen. Learnings surface as "Knowledge".
 */
export function targetToScreen(
  target: "instructions" | "skills" | "learnings",
): AgentAdminScreen {
  return target === "learnings" ? "knowledge" : target;
}
