export type RoutineChatMode = "shared" | "per_run";

export interface ComposioTriggerBinding {
  kind?: "composio";
  toolkit: string;
  trigger_slug: string;
  trigger_config: Record<string, unknown>;
  connected_account_id?: string;
}

export interface WebhookTriggerBinding {
  kind: "webhook";
  key_prefix?: string;
}

export type RoutineTriggerBinding =
  | ComposioTriggerBinding
  | WebhookTriggerBinding;

export interface Routine {
  id: string;
  name: string;
  prompt: string;
  schedule?: string;
  trigger?: RoutineTriggerBinding;
  enabled: boolean;
  suppress_when_silent: boolean;
  chat_mode: RoutineChatMode;
  integrations: string[];
  provider?: string | null;
  model?: string | null;
  effort?: string | null;
  setup_activity_id?: string;
  created_at: string;
  updated_at: string;
}

export type RunStatus =
  | "running"
  | "silent"
  | "surfaced"
  | "error"
  | "cancelled";

export type RoutineRunFailure =
  | {
      code:
        | "creator_not_connected"
        | "team_not_connected"
        | "creator_needs_reconnect"
        | "team_needs_reconnect"
        | "out_of_credits"
        | "model_unavailable";
      provider: string;
    }
  | { code: "no_model" }
  | {
      code: "usage_limit";
      provider: string;
      model: string | null;
      resets_at: string | null;
    };

export interface RoutineRun {
  id: string;
  routine_id: string;
  status: RunStatus;
  session_key: string;
  activity_id?: string;
  summary?: string;
  started_at: string;
  completed_at?: string;
  paused_until?: string;
  failure?: RoutineRunFailure;
}

export interface RoutineFormData {
  name: string;
  prompt: string;
  schedule: string;
  suppress_when_silent: boolean;
  chat_mode: RoutineChatMode;
  integrations: string[];
  provider?: string | null;
  model?: string | null;
  effort?: string | null;
}

export type SchedulePreset =
  | "every_30min"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "custom";

export const SCHEDULE_PRESET_LABELS: Record<SchedulePreset, string> = {
  every_30min: "Every 30 minutes",
  hourly: "Every hour",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  custom: "Custom",
};

export type {
  RoutineEditPatch,
  RoutineWake,
  RoutineWakeMode,
  TriggerApp,
  TriggerAppAccount,
  TriggerStatusItem,
  TriggerStatusState,
} from "./trigger-types";
