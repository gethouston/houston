import type { RoutineAutoPause, RoutineSnooze } from "@houston/protocol";

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
  created_by?: string;
  auto_paused?: RoutineAutoPause;
  snoozed?: RoutineSnooze;
  created_at: string;
  updated_at: string;
}

export interface NewRoutine {
  name: string;
  prompt: string;
  schedule?: string;
  trigger?: RoutineTriggerBinding;
  enabled?: boolean;
  suppress_when_silent?: boolean;
  chat_mode?: RoutineChatMode;
  integrations?: string[];
  provider?: string | null;
  model?: string | null;
  effort?: string | null;
  setup_activity_id?: string;
}

export interface RoutineUpdate {
  name?: string;
  prompt?: string;
  schedule?: string;
  trigger?: RoutineTriggerBinding | null;
  enabled?: boolean;
  suppress_when_silent?: boolean;
  chat_mode?: RoutineChatMode;
  integrations?: string[];
  provider?: string | null;
  model?: string | null;
  effort?: string | null;
  setup_activity_id?: string;
}
