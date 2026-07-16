import type { Capabilities } from "@houston-ai/engine-client";
import { apiKeysSupported } from "../../../lib/api-keys-model.ts";
import { isMultiplayer } from "../../../lib/org-roles.ts";
import type { Agent } from "../../../lib/types";

/**
 * The sections the manager-only Agent Settings tab can show. Each nav item in
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
  | "connect";

/** Shared props for every Agent Settings section component. */
export interface AgentAdminScreenProps {
  agent: Agent;
}

export type AgentAdminCardId = "configuration" | "access" | "connect";

export interface AgentAdminCard {
  id: AgentAdminCardId;
  rows: AgentAdminScreen[];
}

/**
 * Which grouped nav sections + rows the Agent Settings rail shows for this
 * caller.
 *
 * - **Configuration** (always): instructions, skills, knowledge.
 * - **Access** (multiplayer only): people with access. The governance ceilings
 *   (allowed integrations + allowed models) moved OUT of Agent Settings — they
 *   live in the one Permissions view now — so this card is just "who can use
 *   this agent".
 * - **Connect** (hosted public API only, `capabilities.apiKeys` — C10): use the
 *   agent from other apps (MCP / A2A / missions REST). Absent on desktop-local,
 *   self-host, and gateways that predate the public API.
 *
 * Single-player / self-host gets Configuration only — no Access card (no sharing
 * / no ceilings). Only managers/owners (or the single-player sole user) ever
 * reach this tab, so everything here is editable; the gateway is the real
 * enforcer.
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
    cards.push({ id: "access", rows: ["people"] });
  }

  if (apiKeysSupported(caps ?? null)) {
    cards.push({ id: "connect", rows: ["connect"] });
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
