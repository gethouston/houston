import type { AgentAccess, AgentAssignment } from "../agents/types";

export type { AgentAccess, AgentAssignment };

/**
 * Per-agent settings, from `GET /v1/agents/{agentSlugOrId}/settings`.
 * `allowedToolkits` is the agent-level integration ceiling (`null` =
 * unrestricted, `[]` = none) and is the WHOLE effective allowlist — policy is
 * per agent only. `access` is the caller's effective access. `allowedModels` is
 * the manager-set AI-model ceiling: which models a member may pick for this
 * agent (`null` = every model allowed, `[]` = none). A listed model id is
 * allowed on every provider; a retired id also allows the model its provider's
 * catalog row runs it as (`runsAs`), on that provider only, so `claude-opus-5`
 * allows `claude-opus-5-5` on anthropic. Each member's own pick lives in
 * {@link AgentModelChoiceInfo}, and the gateway clamps that pick to this
 * ceiling on every turn.
 */
export interface AgentSettings {
  allowedToolkits: string[] | null;
  access: AgentAccess;
  allowedModels: string[] | null;
}

/**
 * The ceilings `PUT /v1/agents/{agentSlugOrId}/settings` accepts. The gateway
 * READ-THEN-MERGES, so an omitted key is left alone — a one-ceiling PUT leaves
 * the other untouched — and `null` means no limit.
 */
export interface AgentSettingsUpdate {
  allowedToolkits?: string[] | null;
  allowedModels?: string[] | null;
}

/**
 * How hard a reasoning-capable model thinks, ascending. A CLOSED set: the
 * composer offers exactly these four, and a value outside them is dropped on
 * the way to the model rather than clamped, so a caller that invents one gets
 * the provider default with no sign anything was ignored.
 */
export type AgentEffortLevel = "low" | "medium" | "high" | "xhigh";

/**
 * A member's chosen AI model for one shared agent. The agent runs on the
 * ACTING user's choice per turn; the gateway clamps it to the agent's
 * `allowedModels` ceiling. `effort` is the optional reasoning-effort the
 * composer surfaces alongside the model.
 */
export interface AgentModelChoice {
  provider: string;
  model: string;
  effort?: AgentEffortLevel;
}

/**
 * The caller's own `choice` (`null` when they have not picked one) plus the
 * agent's effective `allowedModels` ceiling (`null` = every model allowed), so
 * the composer can offer exactly the pickable set.
 */
export interface AgentModelChoiceInfo {
  choice: AgentModelChoice | null;
  allowedModels: string[] | null;
}

export type {
  TriggerPlanSkipCode,
  TriggerPlanSkipped,
  TriggerStatusItem,
  TriggerStatusState,
} from "@houston/wire-types";
