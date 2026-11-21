import type { AnalyticsEventName } from "./analytics-vocabulary";

export interface StartupAnalytics {
  init(): Promise<{ installId: string; isNew: boolean }>;
  trackActive(): Promise<void>;
  track(event: AnalyticsEventName): void;
}

export function welcomeBridgeUrl(installId: string): string {
  return `https://gethouston.ai/welcome?install_id=${encodeURIComponent(installId)}`;
}

export async function runStartupAnalytics(
  analytics: StartupAnalytics,
  openUrl: (url: string) => Promise<unknown>,
): Promise<void> {
  const { installId, isNew } = await analytics.init();
  void analytics.trackActive();
  if (isNew) {
    analytics.track("install_created");
    if (installId) {
      openUrl(welcomeBridgeUrl(installId)).catch(() => {});
    }
  }
  analytics.track("session_started");
}
