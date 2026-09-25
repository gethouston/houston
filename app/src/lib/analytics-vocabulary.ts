/**
 * THE ANALYTICS VOCABULARY — every property that may ride a tracked event, and
 * the ones `cleanProps` keeps. The event names themselves are the sibling file
 * (`analytics-event-names.ts`), re-exported here so one import covers the whole
 * vocabulary.
 *
 * Split out of `analytics.ts` (which re-exports both unions, so no call site
 * changes) because this vocabulary is a contract several things read: the
 * first-party product catalogue types itself against it
 * (`product-analytics/catalogue-table.ts`), and the app's node tests assert
 * against it. Those readers must not drag PostHog and the engine adapter in,
 * which is exactly what importing `analytics.ts` costs — this file holds types
 * and one Set, and imports nothing but its sibling's type.
 */

export type { AnalyticsEventName } from "./analytics-event-names";

export type AnalyticsProperty =
  | "provider"
  | "model"
  | "config_id"
  | "agent_mode"
  | "mission"
  | "source"
  | "error_kind"
  | "workspace_count"
  | "agent_count"
  // New properties
  | "integration_slug"
  // Custom integration connection type: openapi / mcp (custom_integration_added)
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
  // How many update checks failed in a row (update_check_failed)
  | "consecutive_failures"
  // Onboarding funnel
  | "locale"
  | "detected_locale"
  | "step"
  | "agent_id"
  | "conversation_id"
  | "moment_type"
  | "message_position"
  | "conversation_length"
  | "surface"
  // Cloud migration (payload sizes, where already known)
  | "bytes"
  | "selected_segment"
  // Onboarding survey: the industry id, whether the automation goal was given
  // or skipped, and (on onboarding_survey_prompted) which questions are still
  // open — "industry", "goal", or "industry,goal".
  | "selected_industry"
  | "goal_provided"
  | "missing_steps"
  // Which screen asked the question: "first_run_segment" (the onboarding flow)
  // or "profile_completion" (the later prompt for an unfinished survey).
  | "source_screen"
  // The automation goal IN THE USER'S OWN WORDS. Deliberately absent from
  // ALLOWED_PROPS: it is free text, so it never rides an event (autocapture
  // masks user content and events must stay content-free). `track` reads it
  // ONLY to stamp the `onboarding_automation_goal` person property, truncated,
  // which is where the growth team reads goals from.
  | "goal_text"
  // Academy chapter id (academy_chapter_completed) and lesson id
  // (academy_lesson_started / academy_lesson_completed)
  | "chapter"
  | "lesson"
  // Org membership role (org_member_added / org_role_changed)
  | "role"
  // Client UX timing (perf_span)
  | "span"
  | "duration_ms";

export const ALLOWED_PROPS = new Set<AnalyticsProperty>([
  "provider",
  "model",
  "config_id",
  "agent_mode",
  "mission",
  "source",
  "error_kind",
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
  "selected_segment",
  "selected_industry",
  "goal_provided",
  "missing_steps",
  "source_screen",
  "chapter",
  "lesson",
  "role",
  "span",
  "duration_ms",
]);
