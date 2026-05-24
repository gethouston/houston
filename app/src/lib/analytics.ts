import posthog from "posthog-js";
import { getInstallId } from "./install-id";
import { tauriPreferences } from "./tauri";

// __POSTHOG_KEY__, __POSTHOG_HOST__, __APP_VERSION__ declared in vite-env.d.ts,
// baked at build time by Vite from POSTHOG_KEY / POSTHOG_HOST env vars.
const KEY = typeof __POSTHOG_KEY__ !== "undefined" ? __POSTHOG_KEY__ : "";
const HOST =
  typeof __POSTHOG_HOST__ !== "undefined" && __POSTHOG_HOST__
    ? __POSTHOG_HOST__
    : "https://us.i.posthog.com";
const ACTIVE_DATE_KEY = "analytics:last_active_date";

export type AnalyticsEventName =
  | "app_active"
  | "install_created"
  | "workspace_created"
  | "provider_configured"
  | "provider_not_configured"
  | "agent_created"
  | "chat_message_sent"
  | "chat_message_received"
  | "mission_created"
  | "onboarding_started"
  | "onboarding_completed"
  | "user_signed_in"
  | "user_signed_out"
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
  | "agent_count";
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
]);

// Bootstrap PostHog at module load so a configured build can capture errors
// before `analytics.init()` resolves. Product events are fired after init.
let bootstrapped = false;
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
        app_version:
          typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0",
        os: typeof navigator !== "undefined" ? navigator.platform : "unknown",
        is_debug: import.meta.env.DEV,
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
 * Fire-and-forget analytics wrapper. Never throws, never blocks.
 * Empty POSTHOG_KEY → silent no-op (local dev without secrets).
 */
export const analytics = {
  /**
   * Resolve the persistent install_id and identify the PostHog distinct_id.
   * Call once on app mount. Returns `isNew` so callers can track first install.
   */
  init: async (): Promise<{ installId: string; isNew: boolean }> => {
    if (!KEY) return { installId: "", isNew: false };
    const { id, isNew } = await getInstallId();
    try {
      posthog.identify(id);
      posthog.register({ install_id: id });
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
    } catch {
      // Analytics unavailable
    }
  },

  /**
   * Merge anonymous install_id history into an identified user. Call on sign-in.
   * Email is a person property for lookup/filtering, never an event prop.
   */
  alias: (userId: string, profile?: UserProfile) => {
    if (!KEY) return;
    try {
      posthog.alias(userId);
      posthog.identify(userId, personProps(profile));
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
    } catch {
      // Analytics unavailable
    }
  },
};
