import { osNativeMobilePlatform } from "./os-bridge/platform";

export function nativeTelemetryTag(): { surface?: "ios" | "android" } {
  const surface = osNativeMobilePlatform();
  return surface ? { surface } : {};
}
