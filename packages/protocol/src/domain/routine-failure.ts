export type RoutineAccountFailureCode =
  | "creator_not_connected"
  | "team_not_connected"
  | "creator_needs_reconnect"
  | "team_needs_reconnect"
  | "out_of_credits"
  | "model_unavailable";

export type RoutineRunFailureCode =
  | RoutineAccountFailureCode
  | "no_model"
  | "usage_limit"
  | "provider_error";

export type RoutineRunFailure =
  | {
      code: RoutineAccountFailureCode;
      provider: string;
    }
  | { code: "no_model" }
  | {
      code: "usage_limit";
      provider: string;
      model: string | null;
      resets_at: string | null;
    }
  | { code: "provider_error"; provider: string };

export interface RoutineSnooze {
  reason: "usage_limit";
  provider: string;
  model: string | null;
  until: string;
  at: string;
}

export type RoutineDeliveryFailureCode =
  | "pool_delivery_expired"
  | "creator_no_access"
  | "agent_data_needs_repair";

export interface RoutineDeliveryFailure {
  code: RoutineDeliveryFailureCode;
}

export interface RoutineAutoPause {
  reason: RoutineAccountFailureCode;
  provider: string;
  cause?: "no_model" | "provider_error";
  failures: number;
  at: string;
}
