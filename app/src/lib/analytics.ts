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
  // Activation funnel
  | "workspace_created"
  | "provider_configured"
  | "provider_not_configured"
  | "agent_created"
  | "agent_shared"
  | "agent_imported"
  | "chat_message_sent"
  | "chat_message_received"
  | "mission_created"
  // Feature adoption
  | "skill_used"
  | "routine_scheduled"
  | "routine_executed"
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
  | "skill_slug"
  | "routine_id"
  | "agent_slug"
  | "tab_name"
  | "file_kind"
  | "from_version"
  | "to_version";

type Props = Partial<Record<AnalyticsProperty, string | number | boolean>>;
type UserProfile = {
  email?: string | null;
};
type PersonProps = {
  email?: string;
};

const ALLOWED_PROPS = new Set<AnalyticsProperty>([
  "provider",
  "config_id",
  "agent_mode",
  "mission",
  "integrations_skipped",
  "tutorial_run",
  "source",
  "error_kind",
  "workspace_count",
  "agent_count",
  "skill_slug",
  "routine_id",
  "agent_slug",
  "tab_name",
  "file_kind",
  "from_version",
  "to_version",
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

function personProps(profile?: UserProfile): PersonProps | undefined {
  const email = cleanEmail(profile?.email);
  return email ? { email } : undefined;
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
      // Maintain the `is_activated` person property — flips to true on
      // first `chat_message_received` and stays true forever. Lets cohort
      // filters say "activated users" without a complex insight.
      if (event === "chat_message_received") {
        posthog.people.set({ is_activated: true });
      }
    } catch {
      // Analytics unavailable
    }
  },

  /**
   * Merge anonymous install_id history into an identified user. Call on sign-in.
   * Email is a person property for lookup/filtering, never an event prop.
   * Flips the auth_status super property so every event going forward is
   * tagged as authenticated.
   */
  alias: (userId: string, profile?: UserProfile) => {
    if (!KEY) return;
    try {
      posthog.alias(userId);
      posthog.identify(userId, personProps(profile));
      posthog.register({ ...baseSuperProps(), auth_status: "authenticated" });
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

  /** Reset to a fresh anonymous distinct_id. Call on sign-out. */
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
