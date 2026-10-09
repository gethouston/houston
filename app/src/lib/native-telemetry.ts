import { osNativeMobilePlatform } from "./os-bridge/platform";

/** Shared tag shape for Sentry and PostHog; desktop/web add no surface tag. */
export function nativeTelemetryTag(): { surface?: "ios" | "android" } {
  const surface = osNativeMobilePlatform();
  return surface ? { surface } : {};
}
