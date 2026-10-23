/**
 * Houston Partner: an agency's people hold the `partner` org role inside a
 * client's org and manage the agents they build there (C3 matrix v3,
 * `convergence/contracts/C3-org-role-model.md`). Shapes only; the gateway is
 * the sole enforcer, and a gateway that predates partners sends none of this.
 */

import type { OrgRole } from "./types";

/**
 * The roles `POST /v1/org/members` and `PATCH /v1/org/members/:userId` grant
 * today. `partner` is read off the wire but the gateway does not grant it yet
 * (C3 matrix v3); it joins this union the day the gateway does.
 */
export type GrantableOrgRole = Exclude<OrgRole, "partner">;

/** Who manages an agent besides the org's own people. One kind today. */
export type AgentSteward = "partner";

/**
 * A partner's pause on an agent it manages. A paused agent refuses chat turns
 * and routine runs but keeps its data readable. Only a partner clears it.
 */
export interface AgentPause {
  /** The partner's user id. */
  by: string;
  /** When the pause began, ISO-8601. */
  at: string;
  /** The partner's own words for the org's people, as written. */
  note?: string;
}

/**
 * The gateway's refusals around partner-managed agents, coded so a client
 * never keys on the status or the English `error`:
 *
 *  - `agent_paused` (409): a partner paused this agent; nothing ran. The body
 *    carries the `pause`, so a surface names who to contact.
 *  - `partner_managed` (403): the action is reserved to the org's partners on
 *    a partner-managed agent (its settings, instructions, skills, export,
 *    pause). An expected state for everyone else, never a bug.
 */
export type PartnerRefusalCode = "agent_paused" | "partner_managed";

export interface PartnerRefusal {
  code: PartnerRefusalCode;
  error: string;
  pause?: AgentPause;
}

const CODES: readonly string[] = ["agent_paused", "partner_managed"];

/** Parse a pause off the wire; anything malformed is null. */
export function parseAgentPause(value: unknown): AgentPause | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.by !== "string" || raw.by.length === 0) return null;
  if (typeof raw.at !== "string" || !Number.isFinite(Date.parse(raw.at)))
    return null;
  const pause: AgentPause = { by: raw.by, at: raw.at };
  if (typeof raw.note === "string" && raw.note.length > 0)
    pause.note = raw.note;
  return pause;
}

/** Parse only a typed partner refusal body; anything else is null. */
export function parsePartnerRefusal(body: unknown): PartnerRefusal | null {
  if (typeof body !== "object" || body === null) return null;
  const value = body as Record<string, unknown>;
  if (
    typeof value.code !== "string" ||
    !CODES.includes(value.code) ||
    typeof value.error !== "string"
  )
    return null;
  const refusal: PartnerRefusal = {
    code: value.code as PartnerRefusalCode,
    error: value.error,
  };
  const pause = parseAgentPause(value.pause);
  if (pause) refusal.pause = pause;
  return refusal;
}
