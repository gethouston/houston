import type { Capabilities } from "@houston-ai/engine-client";
import { isMultiplayer } from "../../../lib/org-roles.ts";

/**
 * The full-pane screens the manager-only Agent Settings tab can drill into. Row
 * ids on the landing map 1:1 to a screen. Name / color / delete are NOT screens
 * anymore — they render as inline control rows on the landing (see
 * `agent-admin-details`), so there is no "general" or "template" concept here.
 * Pure, DOM-free so the card/row visibility is unit-tested.
 */
export type AgentAdminScreen =
  | "instructions"
  | "skills"
  | "knowledge"
  | "model"
  | "people"
  | "integrations";

export type AgentAdminCardId = "configuration" | "access";

export interface AgentAdminCard {
  id: AgentAdminCardId;
  rows: AgentAdminScreen[];
}

/**
 * Which grouped drill-in cards + rows the Agent Settings landing shows for this
 * caller.
 *
 * - **Configuration** (always): instructions, skills, knowledge.
 * - **Access** (multiplayer only): people with access, allowed integrations,
 *   allowed models — the two governance ceilings sit next to "people". Allowed
 *   models lives here (not Configuration) because the ceiling is a multiplayer
 *   concept: single-player has no ceiling, and its sole user picks a model in the
 *   composer, so single-player never shows a model row at all.
 *
 * Name / color / delete render below these as an inline "General" card
 * (always), so they are not part of this model. Single-player / self-host gets
 * Configuration only — no Access card (no sharing / no ceilings). Only
 * managers/owners (or the single-player sole user) ever reach this tab, so
 * everything here is editable; the gateway is the real enforcer.
 */
export function agentAdminCards(
  caps: Capabilities | null | undefined,
): AgentAdminCard[] {
  const cards: AgentAdminCard[] = [
    {
      id: "configuration",
      rows: ["instructions", "skills", "knowledge"],
    },
  ];

  if (isMultiplayer(caps)) {
    cards.push({ id: "access", rows: ["people", "integrations", "model"] });
  }

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
