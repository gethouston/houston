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
  // Why a turn failed, from the SDK's typed settle (`TurnErrorClass`), and
  // whose turn it was (`sent` by this client / `observed`); `error_kind` is
  // the legacy copy-derived bucket kept for continuity (session_failed,
  // app_error_shown).
  | "error_class"
  | "origin"
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
  // Onboarding survey: the industry and role ids, the company-size bucket,
  // whether the automation goal was given or skipped, and (on
  // onboarding_survey_prompted) which questions are still open, as a comma
  // list of survey steps like "industry,companySize,goal".
  | "selected_industry"
  | "selected_role"
  | "selected_company_size"
  | "goal_provided"
  | "missing_steps"
  // Which screen asked the question: "first_run_role" (the onboarding flow)
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
  // Client UX timing (perf_span). `org_slug` is the hosted org a measured send
  // ran in, the key the gateway's per-org switches use; absent off the gateway.
  // `outcome` is how a send's turn answered: first_text, or no_text / error /
  // cancelled / interrupted / timeout for one that never showed text.
  | "span"
  | "org_slug"
  | "duration_ms"
  | "outcome"
  // Org chart sharing: how the image left, and the chart's people count
  // (its AI Employees ride `agent_count`).
  | "share_channel"
  | "people_count";

export const ALLOWED_PROPS = new Set<AnalyticsProperty>([
  "provider",
  "model",
  "config_id",
  "agent_mode",
  "mission",
  "source",
  "error_kind",
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
]);
