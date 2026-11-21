import type { AgentAccess, AgentAssignment } from "../agents/types";

export type { AgentAccess, AgentAssignment };

export interface AgentSettings {
  allowedToolkits: string[] | null;
  access: AgentAccess;
  allowedModels: string[] | null;
}

export interface AgentSettingsUpdate {
  allowedToolkits?: string[] | null;
  allowedModels?: string[] | null;
}

export type AgentEffortLevel = "low" | "medium" | "high" | "xhigh";

export interface AgentModelChoice {
  provider: string;
  model: string;
  effort?: AgentEffortLevel;
}

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
