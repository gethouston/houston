/**
 * THE ANALYTICS VOCABULARY — every name `analytics.track` accepts, every
 * property that may ride one, and the properties `cleanProps` keeps.
 *
 * Split out of `analytics.ts` (which re-exports all three, so no call site
 * changes) because this vocabulary is a contract several things read: the
 * first-party product catalogue types itself against it
 * (`product-analytics/catalogue-table.ts`), and the app's node tests assert
 * against it. Those readers must not drag PostHog and the engine client in,
 * which is exactly what importing `analytics.ts` costs — this file holds types
 * and one Set, and imports nothing.
 */

export type AnalyticsEventName =
  // Lifecycle / acquisition
  | "app_active"
  | "install_created"
  | "session_started"
  | "session_ended"
  // Auth
  | "user_signed_in"
  // First sign-in of a brand-new GCIP account (its `isNewUser` flag). Fires
  // ONCE per account, ever — the PostHog → Slack new-user notification and
  // the activation funnel key on this single event.
  | "user_signed_up"
  | "user_signed_out"
  // The user permanently deleted their hosted account (HOU-991). Tracked
  // BEFORE the sign-out teardown resets the analytics identity.
  | "account_deleted"
  // Onboarding
  | "onboarding_started"
  | "onboarding_completed"
  | "onboarding_segment_screen_viewed"
  | "onboarding_segment_selected"
  | "onboarding_segment_continued"
  // The two questions the segment screen grew into (industry + the automation
  // goal in the user's own words). Same three-beat shape as the segment step —
  // viewed / selected / continued — so one funnel covers the whole survey, and
  // `source_screen` says whether it was asked at first run or later, from the
  // profile-completion prompt.
  | "onboarding_industry_screen_viewed"
  | "onboarding_industry_selected"
  | "onboarding_industry_continued"
  | "onboarding_goal_screen_viewed"
  | "onboarding_goal_continued"
  // The completion prompt appeared for someone who answered the segment before
  // the survey existed (or bailed mid-way); `missing_steps` names the gaps.
  | "onboarding_survey_prompted"
  // One-time "reconnect your AI" moment after upgrading from the legacy build.
  | "migration_reconnect_completed"
  // First-run cloud-migration wizard (HOU-719): the cloud desktop build offers
  // to move the machine's OLD local data into the user's cloud agents.
  | "cloud_migration_offered"
  | "cloud_migration_backup_done"
  | "cloud_migration_started"
  | "cloud_migration_agent_done"
  | "cloud_migration_agent_failed"
  // The user chose "Migrate later" while this agent's task was in flight, so
  // the task was abandoned, never failed (`step` is where it stood).
  | "cloud_migration_agent_deferred"
  | "cloud_migration_completed"
  | "cloud_migration_skipped"
  | "cloud_migration_deferred"
  // The user clicked "Move my data" on the offer (before backup/prepare —
  // closes the gap between _offered and _backup_done).
  | "cloud_migration_accepted"
  // The wizard died BEFORE any per-agent task ran (`step`: backup | prepare).
  // Per-agent upload failures stay on cloud_migration_agent_failed.
  | "cloud_migration_failed"
  // Onboarding funnel (acquisition→activation) — one event per step the user
  // actually clears, so a single PostHog funnel can show where first-run drops
  // off (broken down by `app_os` for Mac vs Windows). Action-first: where a
  // real action exists (provider/apps connected, message/email sent) we fire on
  // the action, not the Continue click. Each fires exactly ONCE per install
  // (ref/flag-guarded at the call site).
  | "onboarding_language_selected"
  | "onboarding_agreement_accepted"
  | "ai_provider_connected"
  | "tools_provider_connected"
  | "first_message_sent"
  | "first_email_sent"
  // Fires once per onboarding screen reached (carries `step`), so a single
  // funnel shows exactly where people drop off in the redesigned flow.
  | "onboarding_step_viewed"
  // Escape hatch: the user bailed out of a stuck onboarding step (HOU-555).
  // Carries `step`, `provider`, `model` so skip-rate can be broken down by
  // model — some models send the email but never emit the completion marker.
  | "onboarding_skipped"
  // Houston Academy: the learning surface was opened (`source` names where
  // from) and a chapter was cleared (`chapter` is the chapter id). Chapter
  // completion is awarded once per account, so the event doubles as the
  // per-chapter completion rate.
  | "academy_opened"
  | "academy_chapter_completed"
  // A lesson inside a chapter was opened and cleared (`lesson` is the lesson
  // id, `chapter` the one it belongs to) — the finer grain that shows WHERE
  // inside a chapter people stop reading.
  | "academy_lesson_started"
  | "academy_lesson_completed"
  // Activation funnel
  | "workspace_created"
  | "provider_configured"
  | "provider_not_configured"
  // A pasted API key the provider refused with a user-fixable verdict
  // (`error_kind`: invalid_key | key_restricted). Counted, never a Sentry
  // error: it shows which providers' key pages confuse users (PRODUCT-1730).
  | "provider_key_rejected"
  | "agent_created"
  | "agent_installed_from_store"
  | "agent_shared"
  | "agent_published"
  | "agent_imported"
  // A workspace-internal duplicate (`agent_slug` is the SOURCE agent);
  // `source` names the door: the agent's Settings row or the create dialog.
  | "agent_copied"
  // Fired when an agent's self-setup mission auto-starts after it is
  // created/imported. Carries `source` (created vs imported).
  | "agent_onboarding_started"
  | "chat_message_sent"
  | "chat_message_received"
  | "mission_created"
  | "conversation_map_opened"
  | "conversation_map_closed"
  | "conversation_map_moment_clicked"
  | "conversation_map_back_to_latest_clicked"
  // Feature adoption
  | "integration_connected"
  // A connect was refused because Houston has no OAuth app registered for the
  // toolkit (HOU-1110) — carries `integration_slug`, so demand for a missing
  // app registration stays visible without a Sentry issue per click.
  | "integration_connect_unavailable"
  // The web build's browser refused to open the OAuth tab (popup blocker) and
  // the row fell back to an explicit "open" click — carries `integration_slug`
  // so a browser that blocks the hand-off shows up in numbers, not Sentry.
  | "integration_connect_tab_blocked"
  | "integration_disconnected"
  | "custom_integration_started"
  // A custom integration landed via the manual add form (carries
  // `integration_slug` + `kind`: openapi / mcp) — distinct from
  // `custom_integration_started`, the chat-interview kickoff.
  | "custom_integration_added"
  | "custom_integration_oauth_started"
  | "skill_used"
  // A skill landed in the agent (carries `skill_slug` + `source`:
  // community / repo / scratch / promoted / workspace-enable / org-default) —
  // adoption of the skills surface itself, distinct from `skill_used`
  // (execution in chat).
  | "skill_installed"
  | "skill_edited"
  | "skill_deleted"
  // A workspace-shared skill was turned off for one agent (a reversible
  // manifest write, ADR 0003) — the skill itself survives in the store.
  | "skill_disabled"
  | "routine_scheduled"
  | "routine_executed"
  | "routine_chat_setup_started"
  // HOU-791: the guided skill-build chat — "Create with AI" was clicked
  // (`skill_chat_create_clicked`) and the draft chat actually started
  // (`skill_chat_setup_started`).
  | "skill_chat_create_clicked"
  | "skill_chat_setup_started"
  // Create-intake funnel: the locally-driven question cards (before any model
  // call) either resolved into a draft (`source`: custom flow / template pick /
  // composer escape hatch; `template_id` when a template) or were dismissed.
  | "routine_intake_completed"
  | "routine_intake_dismissed"
  | "tab_opened"
  | "file_attached"
  | "mobile_paired"
  // Fires once per search session (empty → non-empty query), not per
  // keystroke. `surface` says which search box (missions, archived, ...).
  | "search_performed"
  | "command_palette_opened"
  // A dictation capture produced a non-empty transcript the user kept.
  | "dictation_used"
  // The user changed the app language from Settings (carries `locale`).
  // Distinct from onboarding_language_selected (first-run pick).
  | "language_changed"
  // AI hub: the model modal was opened (`model` = catalog key).
  | "model_viewed"
  // A model-ceiling write landed (`agent_id`, `source`: any | picked).
  | "models_allowlist_updated"
  // Organization dashboard membership actions (client-side UI counterparts of
  // the gateway's server-side team_* events; `role` where it applies).
  | "org_member_added"
  | "org_member_removed"
  | "org_role_changed"
  | "org_invite_revoked"
  // The INVITEE's own answer to a pending team invite (C8 spaces).
  | "org_invite_accepted"
  | "org_invite_declined"
  // Update lifecycle (closes the symbolication-coverage feedback loop).
  // update_offered: the check found a release; update_downloaded: it landed
  // in the updater's buffer (`source`: launch | poll, which check found it);
  // update_accepted: the install starting (`source`: user | launch, the
  // restart pill's click vs the silent launch-time install).
  | "update_offered"
  | "update_downloaded"
  | "update_accepted"
  // The check itself keeps failing: after UPDATE_CHECK_STUCK_THRESHOLD
  // consecutive failures the client counts as stuck — it may never see an
  // update again (release feed unreachable), so it self-reports once per
  // streak (PRODUCT-1386). `from_version` is the build it is stuck on.
  | "update_check_failed"
  // Reliability
  | "session_completed"
  | "session_failed"
  | "app_error_shown"
  // Client UX timing span (HOU-1011): PostHog mirror of the gateway's
  // Prometheus histograms, for per-user/session drill-down. Carries `span`
  // (which journey) + `duration_ms`.
  | "perf_span";

export type AnalyticsProperty =
  | "provider"
  | "model"
  | "config_id"
  | "agent_mode"
  | "mission"
  | "integrations_skipped"
  | "tutorial_run"
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
  "integrations_skipped",
  "tutorial_run",
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
