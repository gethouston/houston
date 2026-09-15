import posthog from "posthog-js";
import { notifyAnalytics } from "./analytics-bus";
// The vocabulary (both unions + the property allow-list) lives in its own file
// so readers that must not drag PostHog in can have it; it is re-exported here
// because `lib/analytics` is the front door every call site already imports.
import {
  ALLOWED_PROPS,
  type AnalyticsEventName,
  type AnalyticsProperty,
} from "./analytics-vocabulary";
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

export type { AnalyticsListener } from "./analytics-bus";
export { subscribeAnalytics } from "./analytics-bus";
export type { AnalyticsEventName, AnalyticsProperty };

const ACTIVE_DATE_KEY = "analytics:last_active_date";
const FIRST_INSTALL_VERSION_KEY = "analytics:first_install_version";
const FIRST_INSTALL_DATE_KEY = "analytics:first_install_date";

// Ceiling on the automation goal stored as a person property: enough to read
// the intent, short enough that a pasted essay can't bloat every person record.
const GOAL_PERSON_PROP_MAX = 500;

// Per-process session id. Regenerated every app launch — lets us group
// events that happened in the same "sit-down session" without making
// users a tracking surface.
const SESSION_ID = crypto.randomUUID();

/**
 * The launch's session id, for the OTHER pipe: the first-party product
 * analytics ingest stamps the same value on its own events
 * (`lib/product-analytics/`), so one sit-down reads as one session on both
 * sides without a join table.
 */
export function analyticsSessionId(): string {
  return SESSION_ID;
}

type Props = Partial<Record<AnalyticsProperty, string | number | boolean>>;
type UserIdentity = {
  email?: string | null;
  /** Provider display name — person property (like email, never an event prop). */
  name?: string | null;
  /**
   * ISO date (YYYY-MM-DD) acquisition cohort. The GCP Identity Platform
   * session carries no created_at, so post-migration callers pass `null`
   * and the signup_date person property is simply not stamped (harmless).
   */
  signupDate?: string | null;
};

// Bootstrap PostHog at module load so a configured build can capture errors
// before `analytics.init()` resolves. Product events are fired after init.
let bootstrapped = false;

function rawNavigatorPlatform() {
  return typeof navigator !== "undefined" ? navigator.platform : "unknown";
}

function baseSuperProps() {
  // The web entry injects the runtime deploy environment on
  // `window.__HOUSTON_DEPLOY_ENV__` (production / preview / development, derived
  // from the hostname of the ONE promoted bundle). Attach it as a super property
  // so preview traffic is filterable out of product metrics. Unset on the
  // desktop, where `is_debug` already separates dev from release.
  const deployEnv =
    typeof window !== "undefined" ? window.__HOUSTON_DEPLOY_ENV__ : undefined;
  return {
    app_version: APP_VERSION,
    app_os: currentPlatformOs,
    os: rawNavigatorPlatform(),
    is_debug: import.meta.env.DEV,
    session_id: SESSION_ID,
    ...(deployEnv ? { environment: deployEnv } : {}),
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
    // Friction signals ($rageclick / $dead_click) require autocapture. Masking
    // keeps user content (agent names, email subjects, chat text) out of
    // PostHog — only element selectors/positions leave the app. Specific
    // question behind enabling (production-infra.md): where does the v0.5.9
    // onboarding strand users?
    autocapture: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
    capture_dead_clicks: true,
    rageclick: true,
    // Recordings + heatmaps (user-approved 2026-07-16) answer the open
    // production-infra.md question: where does onboarding strand users?
    // Both ride the SAME masking as autocapture above — recordings capture
    // the masked DOM (all text as asterisks), heatmaps only element
    // selectors/positions — so user content still never leaves the app.
    // The PostHog project toggles (session_recording_opt_in /
    // heatmaps_opt_in) must be ON too; either side alone captures nothing.
    //
    // Do NOT set `advanced_disable_flags` here. The web recorder does not
    // start from local config alone: it waits for the remote `/flags`
    // response, which carries the `sessionRecording` block (endpoint, sample
    // rate, masking). Suppressing that request means the recorder never
    // initializes, `recorder.js` is never fetched, and not a single
    // `$snapshot` is emitted — replay looks enabled on both sides yet
    // captures nothing, silently. That flag shipped alongside replay in
    // 0.5.18+ and is why this project has zero recordings.
    disable_session_recording: false,
    enable_heatmaps: true,
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
    lower.includes("timeout") ||
    // WebKit's transport-failure message (HOU-1085) names neither "network"
    // nor "fetch" — without this line an offline burst classifies as unknown.
    lower.includes("load failed")
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
    // The app's own listeners hear EVERY tracked event, before and regardless
    // of PostHog: a local dev build has no key and still earns Academy points.
    notifyAnalytics(event, props);
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
      // Stamp the onboarding answer as a person property so every cohort,
      // funnel, and breakdown can slice by segment without joining back to
      // the one-off event. Set on the confirmed answer (Continue), not the
      // exploratory clicks. Skippers get "skipped" so they form their own
      // cohort instead of vanishing into "no property".
      if (
        event === "onboarding_segment_continued" &&
        typeof props?.selected_segment === "string"
      ) {
        posthog.people.set({ onboarding_segment: props.selected_segment });
      }
      // The other two survey answers, stamped on the same "Continue" beat and
      // for the same reason: cohort by industry, and read what people actually
      // want automated without joining back to a one-off event. Skippers get
      // "skipped" so they form a cohort instead of vanishing into "no value".
      if (
        event === "onboarding_industry_continued" &&
        typeof props?.selected_industry === "string"
      ) {
        posthog.people.set({ onboarding_industry: props.selected_industry });
      }
      if (event === "onboarding_goal_continued") {
        const goal =
          props?.goal_provided === true && typeof props.goal_text === "string"
            ? props.goal_text.slice(0, GOAL_PERSON_PROP_MAX)
            : props?.goal_provided === false
              ? "skipped"
              : null;
        if (goal) posthog.people.set({ onboarding_automation_goal: goal });
      }
    } catch {
      // Analytics unavailable
    }
  },

  /**
   * PostHog LLM-observability event, one per finished model turn. Bypasses
   * the AnalyticsEventName/ALLOWED_PROPS whitelist deliberately: `$ai_*`
   * names are PostHog's canonical LLM schema (the AI Usage dashboard reads
   * them), and the payload is built EXCLUSIVELY by `buildAiGenerationProps`
   * (app/src/lib/ai-generation.ts), whose input type structurally excludes
   * prompt/response content — only model, tokens, latency, and cost leave
   * the app.
   */
  trackAiGeneration: (props: Record<string, string | number | boolean>) => {
    if (!KEY) return;
    try {
      posthog.capture("$ai_generation", props);
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
      const name = identity?.name?.trim() || undefined;
      posthog.alias(userId);
      posthog.setPersonProperties(
        {
          firebase_uid: userId,
          ...(email ? { email } : {}),
          ...(name ? { name } : {}),
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
