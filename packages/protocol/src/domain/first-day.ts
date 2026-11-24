import type { AgentArrival } from "./config";

export interface FirstDayStartInput {
  locale?: string;
  title?: string;
}

export type FirstDayOutcome = "started" | "existing";

export interface FirstDayStartResult {
  outcome: FirstDayOutcome;
  mission: {
    id: string;
    sessionKey: string;
    title: string;
  };
  role: string | null;
  arrival?: AgentArrival;
}

export type FirstDayRefusalCode =
  | "first_day_not_pending"
  | "first_day_not_started"
  | "first_day_no_provider"
  | "first_day_provider_unavailable";

export interface FirstDayRefusal {
  code: FirstDayRefusalCode;
  error: string;
  provider?: string;
}
