import posthog from "posthog-js";
import {
  ANALYTICS_KEY as KEY,
  ANALYTICS_SESSION_ID as SESSION_ID,
} from "./analytics-bootstrap";
import { notifyAnalytics } from "./analytics-bus";
import { analyticsIdentity } from "./analytics-identity";
import { todayISODate } from "./analytics-install-vintage";
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

const GOAL_PERSON_PROP_MAX = 500;

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
    notifyAnalytics(event, props);
    if (!KEY) return;
    try {
      posthog.capture(event, cleanProps(props));
      if (event === "chat_message_sent") {
        posthog.people.set({ is_activated: true });
      }
      if (
        event === "onboarding_industry_continued" &&
        typeof props?.selected_industry === "string"
      ) {
        posthog.people.set({ onboarding_industry: props.selected_industry });
      }
      if (
        event === "onboarding_role_continued" &&
        typeof props?.selected_role === "string"
      ) {
        posthog.people.set({ onboarding_role: props.selected_role });
      }
      if (
        event === "onboarding_company_size_continued" &&
        typeof props?.selected_company_size === "string"
      ) {
        posthog.people.set({
          onboarding_company_size: props.selected_company_size,
        });
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
    } catch {}
  },

  trackAiGeneration: (props: Record<string, string | number | boolean>) => {
    if (!KEY) return;
    try {
      posthog.capture("$ai_generation", props);
    } catch {}
  },

  captureException: (error: unknown, props?: Props) => {
    if (!KEY) return;
    try {
      const normalized =
        error instanceof Error ? error : new Error(String(error));
      posthog.captureException(normalized, cleanProps(props));
    } catch {}
  },
};
