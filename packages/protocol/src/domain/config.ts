export type AgentFirstDay = "pending" | "started";

export type AgentArrival = "created" | "imported";

export interface AgentConfig {
  name?: string;
  provider?: string;
  model?: string;
  effort?: string;
  firstDay?: AgentFirstDay;
  arrival?: AgentArrival;
  [extra: string]: unknown;
}

export interface AgentInitialConfig {
  provider?: string;
  model?: string;
  firstDay?: Extract<AgentFirstDay, "pending">;
  arrival?: AgentArrival;
}

export interface InstalledAgentConfig {
  config: Record<string, unknown>;
  path: string;
}

export interface PreferenceValue {
  value: string | null;
}

export type KnownPreferenceKey = "timezone" | "locale";
