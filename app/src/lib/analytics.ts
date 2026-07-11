import posthog from "posthog-js";
import { getInstallId } from "./install-id";
import { currentPlatformOs } from "./platform";
import { tauriPreferences } from "./tauri";

// __POSTHOG_KEY__, __POSTHOG_HOST__, __APP_VERSION__ declared in vite-env.d.ts,
// baked at build time by Vite from POSTHOG_KEY / POSTHOG_HOST env vars.
const KEY = typeof __POSTHOG_KEY__ !== "undefined" ? __POSTHOG_KEY__ : "";
const HOST =
  typeof __POSTHOG_HOST__ !== "undefined" && __POSTHOG_HOST__
    ? __POSTHOG_HOST__
    : "https://us.i.posthog.com";
const APP_VERSION =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0";

const ACTIVE_DATE_KEY = "analytics:last_active_date";
const FIRST_INSTALL_VERSION_KEY = "analytics:first_install_version";
const FIRST_INSTALL_DATE_KEY = "analytics:first_install_date";

// Per-process session id. Regenerated every app launch — lets us group
// events that happened in the same "sit-down session" without making
// users a tracking surface.
const SESSION_ID = crypto.randomUUID();

export type AnalyticsEventName =
  // Lifecycle / acquisition
  | "app_active"
  | "install_created"
  | "session_started"
  | "session_ended"
  // Auth
  | "user_signed_in"
  | "user_signed_out"
  // Onboarding
  | "onboarding_started"
  | "onboarding_completed"
  // One-time "reconnect your AI" moment after upgrading from the legacy build.
  | "migration_reconnect_completed"
  // First-run cloud-migration wizard (HOU-719): the cloud desktop build offers
  // to move the machine's OLD local data into the user's cloud agents.
  | "cloud_migration_offered"
  | "cloud_migration_backup_done"
  | "cloud_migration_started"
  | "cloud_migration_agent_done"
  | "cloud_migration_agent_failed"
  | "cloud_migration_completed"
  | "cloud_migration_skipped"
  | "cloud_migration_deferred"
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
  // Activation funnel
  | "workspace_created"
  | "provider_configured"
  | "provider_not_configured"
  | "agent_created"
  | "agent_installed_from_store"
  | "agent_shared"
  | "agent_imported"
  // Fired when an agent's self-setup mission auto-starts after it is
  // created/imported. Carries `source` (created vs imported).
  | "agent_onboarding_started"
  | "chat_message_sent"
  | "chat_message_received"
  | "mission_created"
  // Feature adoption
  | "integration_connected"
  | "integration_disconnected"
  | "skill_used"
  | "routine_scheduled"
  | "routine_executed"
  | "routine_chat_setup_started"
  | "tab_opened"
  | "file_attached"
  | "mobile_paired"
  // Update lifecycle (closes the symbolication-coverage feedback loop)
  | "update_offered"
  | "update_accepted"
  | "update_dismissed"
  // Reliability
  | "session_completed"
  | "session_failed"
  | "app_error_shown";

type AnalyticsProperty =
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
  | "skill_slug"
  | "routine_id"
  | "agent_slug"
  | "tab_name"
  | "file_kind"
  | "from_version"
  | "to_version"
  // Onboarding funnel
  | "locale"
  | "step"
  // Cloud migration (payload sizes, where already known)
  | "bytes";

type Props = Partial<Record<AnalyticsProperty, string | number | boolean>>;
type UserIdentity = {
  email?: string | null;
  /**
   * ISO date (YYYY-MM-DD) acquisition cohort. The GCP Identity Platform
   * session carries no created_at, so post-migration callers pass `null`
   * and the signup_date person property is simply not stamped (harmless).
   */
  signupDate?: string | null;
};

const ALLOWED_PROPS = new Set<AnalyticsProperty>([
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
  "skill_slug",
  "routine_id",
  "agent_slug",
  "tab_name",
  "file_kind",
  "from_version",
  "to_version",
  "locale",
  "step",
  "bytes",
]);

// Bootstrap PostHog at module load so a configured build can capture errors
// before `analytics.init()` resolves. Product events are fired after init.
let bootstrapped = false;

function rawNavigatorPlatform() {
  return typeof navigator !== "undefined" ? navigator.platform : "unknown";
}

function baseSuperProps() {
  return {
    app_version: APP_VERSION,
    app_os: currentPlatformOs,
    os: rawNavigatorPlatform(),
    is_debug: import.meta.env.DEV,
    session_id: SESSION_ID,
  };
}

function bootstrap() {
  if (bootstrapped || !KEY) return;
  bootstrapped = true;
  posthog.init(KEY, {
    api_host: HOST,
    defaults: "2026-01-30",
    person_profiles: "identified_only",
    capture_pageview: false,
    capture_pageleave: false,
    autocapture: false,
    capture_dead_clicks: false,
    rageclick: false,
    disable_session_recording: true,
    enable_heatmaps: false,
    advanced_disable_flags: true,
    loaded: (ph) => {
      ph.register({
        ...baseSuperProps(),
        auth_status: "anonymous",
      });
    },
  });
}
bootstrap();

function cleanProps(props?: Props): Props | undefined {
  if (!props) return undefined;
  const next: Props = {};
  for (const key of ALLOWED_PROPS) {
    if (props[key] !== undefined) next[key] = props[key];
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function activeDate() {
  return new Date().toISOString().slice(0, 10);
}

function cleanEmail(email?: string | null): string | undefined {
  const value = email?.trim().toLowerCase();
  const at = value?.lastIndexOf("@") ?? -1;
  return value && at > 0 && at < value.length - 1 ? value : undefined;
}

function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(fromISO).getTime();
  const b = new Date(toISO).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.floor((b - a) / (1000 * 60 * 60 * 24)));
}

export function classifyAnalyticsError(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes("auth") ||
    lower.includes("token") ||
    lower.includes("login")
  )
    return "auth";
  if (
    lower.includes("network") ||
    lower.includes("fetch") ||
    lower.includes("timeout")
  )
    return "network";
  if (lower.includes("permission") || lower.includes("denied"))
    return "permission";
  if (
    lower.includes("provider") ||
    lower.includes("openai") ||
    lower.includes("anthropic")
  )
    return "provider";
  if (
    lower.includes("unknown option") ||
    lower.includes("enoent") ||
    lower.includes("spawn") ||
    lower.includes("not found") ||
    lower.includes("claude hit a runtime error") ||
    lower.includes("codex hit a runtime error")
  ) {
    return "cli";
  }
  return "unknown";
}

/**
 * Set or read the first-install-version + first-install-date person
 * properties. Set ONCE per install on the first analytics.init() call;
 * subsequent launches just confirm + read for `days_since_install` math.
 */
async function ensureFirstInstallProps(): Promise<{
  firstInstallVersion: string;
  firstInstallDate: string;
}> {
  const today = activeDate();
  const existingVersion = await tauriPreferences
    .get(FIRST_INSTALL_VERSION_KEY)
    .catch(() => null);
  const existingDate = await tauriPreferences
    .get(FIRST_INSTALL_DATE_KEY)
    .catch(() => null);

  const firstInstallVersion = existingVersion ?? APP_VERSION;
  const firstInstallDate = existingDate ?? today;

  if (!existingVersion) {
    await tauriPreferences
      .set(FIRST_INSTALL_VERSION_KEY, firstInstallVersion)
      .catch(() => {});
  }
  if (!existingDate) {
    await tauriPreferences
      .set(FIRST_INSTALL_DATE_KEY, firstInstallDate)
      .catch(() => {});
  }

  return { firstInstallVersion, firstInstallDate };
}

/**
 * Fire-and-forget analytics wrapper. Never throws, never blocks.
 * Empty POSTHOG_KEY → silent no-op (local dev without secrets).
 */
export const analytics = {
  /**
   * Resolve the persistent install_id and identify the PostHog distinct_id.
   * Stamps install-vintage person properties (first_install_version,
   * first_install_date) on first launch, days_since_install on every
   * launch. Call once on app mount. Returns `isNew` so callers can track
   * first install.
   */
  init: async (): Promise<{ installId: string; isNew: boolean }> => {
    if (!KEY) return { installId: "", isNew: false };
    const { id, isNew } = await getInstallId();
    const { firstInstallVersion, firstInstallDate } =
      await ensureFirstInstallProps();
    try {
      posthog.identify(id, {
        first_install_version: firstInstallVersion,
        first_install_date: firstInstallDate,
        install_os: currentPlatformOs,
      });
      posthog.register({
        ...baseSuperProps(),
        install_id: id,
        days_since_install: daysBetween(firstInstallDate, activeDate()),
      });
    } catch {
      // Analytics unavailable
    }
    return { installId: id, isNew };
  },

  trackActive: async () => {
    if (!KEY) return;
    const today = activeDate();
    const last = await tauriPreferences.get(ACTIVE_DATE_KEY).catch(() => null);
    if (last === today) return;
    analytics.track("app_active");
    await tauriPreferences.set(ACTIVE_DATE_KEY, today).catch(() => {});
  },

  track: (event: AnalyticsEventName, props?: Props) => {
    if (!KEY) return;
    try {
      posthog.capture(event, cleanProps(props));
      // Maintain the `is_activated` person property — flips to true on the
      // user's first `chat_message_sent` (activation = the user sends a
      // message) and stays true forever. Lets cohort filters say "activated
      // users" without a complex insight.
      if (event === "chat_message_sent") {
        posthog.people.set({ is_activated: true });
      }
    } catch {
      // Analytics unavailable
    }
  },

  /**
   * Tie the signed-in user's Firebase identity to their PostHog person.
   * Call on sign-in. Does two complementary things:
   *
   * 1. `alias(userId)` — adds the Firebase UID as an alias of the current
   *    install_id person. The distinct_id STAYS install_id (so the website
   *    `/welcome` UTM bridge and the sequential onboarding funnel are untouched),
   *    but because every device/reinstall aliases the SAME Firebase UID, PostHog
   *    stitches a human's separate per-device persons into ONE. alias is the call
   *    that merges; a second `identify()` with a new distinct_id is ignored once
   *    a person is identified, so identify is NOT a substitute here.
   * 2. `setPersonProperties` — also stamps `firebase_uid` (plus email `$set`,
   *    signup_date `$set_once`) so the id is a queryable join key to the identity
   *    platform, not only an internal alias. Email is a person property for
   *    lookup/filtering, never an event prop.
   *
   * Finally flips `auth_status` → "authenticated" and stamps `auth_platform`:
   * "gcp" as super properties so every event going forward is tagged with the
   * signed-in platform. Identity-platform discontinuity is ACCEPTED: the UID is
   * a fresh Firebase UID (not the old Supabase id), so historical Supabase-id
   * joins do not carry over — this is a fresh platform, by design.
   */
  identifyUser: (userId: string, identity?: UserIdentity) => {
    if (!KEY) return;
    try {
      const email = cleanEmail(identity?.email);
      posthog.alias(userId);
      posthog.setPersonProperties(
        {
          firebase_uid: userId,
          ...(email ? { email } : {}),
        },
        identity?.signupDate ? { signup_date: identity.signupDate } : undefined,
      );
      posthog.register({
        ...baseSuperProps(),
        auth_status: "authenticated",
        auth_platform: "gcp",
      });
    } catch {
      // Analytics unavailable
    }
  },

  captureException: (error: unknown, props?: Props) => {
    if (!KEY) return;
    try {
      const normalized =
        error instanceof Error ? error : new Error(String(error));
      posthog.captureException(normalized, cleanProps(props));
    } catch {
      // Analytics unavailable
    }
  },

  /**
   * Reset to a fresh anonymous distinct_id. Call on sign-out.
   *
   * `posthog.reset()` clears all previously registered super properties, and we
   * re-register only `baseSuperProps()` + `auth_status: "anonymous"`. Because
   * `baseSuperProps()` intentionally omits `auth_platform` (the platform is only
   * known post-sign-in), that property drops naturally here and never leaks
   * across a sign-out — no explicit unset needed.
   */
  reset: () => {
    if (!KEY) return;
    try {
      posthog.reset();
      posthog.register({ ...baseSuperProps(), auth_status: "anonymous" });
    } catch {
      // Analytics unavailable
    }
  },
};
