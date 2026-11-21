export type { AnalyticsEventName } from "./analytics-event-names";

export type AnalyticsProperty =
  | "provider"
  | "model"
  | "config_id"
  | "agent_mode"
  | "mission"
  | "source"
  | "error_kind"
  | "stop_reason"
  | "error_class"
  | "origin"
  | "workspace_count"
  | "agent_count"
  | "integration_slug"
  | "integration_kind"
  | "skill_slug"
  | "routine_id"
  | "wake_kind"
  | "template_id"
  | "agent_slug"
  | "tab_name"
  | "file_kind"
  | "from_version"
  | "to_version"
  | "consecutive_failures"
  | "locale"
  | "detected_locale"
  | "step"
  | "agent_id"
  | "conversation_id"
  | "moment_type"
  | "message_position"
  | "conversation_length"
  | "surface"
  | "bytes"
  | "selected_industry"
  | "selected_role"
  | "selected_company_size"
  | "goal_provided"
  | "missing_steps"
  | "source_screen"
  | "goal_text"
  | "chapter"
  | "lesson"
  | "role"
  | "span"
  | "org_slug"
  | "duration_ms"
  | "outcome"
  | "share_channel"
  | "people_count"
  | "reason";

export const ALLOWED_PROPS = new Set<AnalyticsProperty>([
  "provider",
  "model",
  "config_id",
  "agent_mode",
  "mission",
  "source",
  "error_kind",
  "stop_reason",
  "error_class",
  "origin",
  "workspace_count",
  "agent_count",
  "integration_slug",
  "integration_kind",
  "skill_slug",
  "routine_id",
  "wake_kind",
  "template_id",
  "agent_slug",
  "tab_name",
  "file_kind",
  "from_version",
  "to_version",
  "consecutive_failures",
  "locale",
  "detected_locale",
  "step",
  "agent_id",
  "conversation_id",
  "moment_type",
  "message_position",
  "conversation_length",
  "surface",
  "bytes",
  "selected_industry",
  "selected_role",
  "selected_company_size",
  "goal_provided",
  "missing_steps",
  "source_screen",
  "chapter",
  "lesson",
  "role",
  "span",
  "org_slug",
  "duration_ms",
  "outcome",
  "share_channel",
  "people_count",
  "reason",
]);
