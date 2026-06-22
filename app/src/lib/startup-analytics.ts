import type { AnalyticsEventName } from "./analytics";

/**
 * The minimal analytics surface this routine needs — a structural subset of the
 * `analytics` singleton. Declared here (not imported from `./analytics`) so this
 * module pulls in NO browser/Tauri runtime deps and stays unit-testable.
 */
export interface StartupAnalytics {
  init(): Promise<{ installId: string; isNew: boolean }>;
  trackActive(): Promise<void>;
  track(event: AnalyticsEventName): void;
}

/**
 * Attribution-bridge URL: opens the website's `/welcome` page in the default
 * browser. That page reads `?install_id`, calls `posthog.identify(install_id)`,
 * and MERGES the anonymous website person (carrying the original `$initial_utm_*`
 * from the landing pageview) into the app's install identity.
 */
export function welcomeBridgeUrl(installId: string): string {
  return `https://gethouston.ai/welcome?install_id=${encodeURIComponent(installId)}`;
}

/**
 * Fire the install-lifecycle analytics that MUST precede the first-run
 * onboarding funnel.
 *
 * Ordering matters: the acquisition→activation funnel is keyed on
 * `install_created` as step 1, and PostHog funnels are sequential (each step
 * must occur AFTER the previous). The first onboarding steps
 * (`onboarding_welcome_continued`, `onboarding_language_selected`,
 * `onboarding_agreement_accepted`) fire from the language/disclaimer gates,
 * which sit ABOVE `<App/>` in the tree and block it from mounting until cleared.
 * When `analytics.init()` + `install_created` lived in App's mount effect they
 * fired AFTER those gate events, so the funnel broke at step 2 and every
 * downstream step reported 0. Running this at the very top of the tree (above
 * the gates) emits `install_created` first AND runs `posthog.identify(install_id)`
 * before any `onboarding_*` event, so all events share one identity from the
 * start.
 *
 * Never throws, never blocks rendering.
 */
export async function runStartupAnalytics(
  analytics: StartupAnalytics,
  openUrl: (url: string) => Promise<unknown>,
): Promise<void> {
  const { installId, isNew } = await analytics.init();
  // Daily DAU signal — order vs `install_created` is irrelevant (not a funnel
  // step), so don't serialize on it.
  void analytics.trackActive();
  if (isNew) {
    analytics.track("install_created");
    if (installId) {
      // Best-effort attribution bridge; silent on failure (no default browser,
      // dev build) — the accepted tradeoff for not requiring clipboard hacks.
      // Losing it only costs UTM attribution for this one install.
      openUrl(welcomeBridgeUrl(installId)).catch(() => {});
    }
  }
  // Fires every launch (cf. `app_active` which dedupes per UTC day for DAU).
  analytics.track("session_started");
}
