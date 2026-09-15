import posthog from "posthog-js";
// Imported for its side effect too: PostHog is initialised at module load.
import {
  ANALYTICS_KEY as KEY,
  ANALYTICS_SESSION_ID as SESSION_ID,
} from "./analytics-bootstrap";
import { notifyAnalytics } from "./analytics-bus";
import { analyticsIdentity } from "./analytics-identity";
import { todayISODate } from "./analytics-install-vintage";
// The vocabulary (both unions + the property allow-list) lives in its own file
// so readers that must not drag PostHog in can have it; the two unions are
// re-exported here because `lib/analytics` is the front door every call site
// already imports.
import {
  ALLOWED_PROPS,
  type AnalyticsEventName,
  type AnalyticsProperty,
} from "./analytics-vocabulary";
import { tauriPreferences } from "./tauri";

export type { AnalyticsListener } from "./analytics-bus";
export { subscribeAnalytics } from "./analytics-bus";
export { classifyAnalyticsError } from "./analytics-error-kind";
export type { AnalyticsEventName, AnalyticsProperty };

const ACTIVE_DATE_KEY = "analytics:last_active_date";

// Ceiling on the automation goal stored as a person property: enough to read
// the intent, short enough that a pasted essay can't bloat every person record.
const GOAL_PERSON_PROP_MAX = 500;

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

function cleanProps(props?: Props): Props | undefined {
  if (!props) return undefined;
  const next: Props = {};
  for (const key of ALLOWED_PROPS) {
    if (props[key] !== undefined) next[key] = props[key];
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * Fire-and-forget analytics wrapper. Never throws, never blocks.
 * Empty POSTHOG_KEY → silent no-op (local dev without secrets).
 *
 * The identity half (init / identifyUser / reset) is `analytics-identity.ts`;
 * it is spread in here so this stays the one object every call site imports.
 */
export const analytics = {
  ...analyticsIdentity,

  trackActive: async () => {
    if (!KEY) return;
    const today = todayISODate();
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
};
