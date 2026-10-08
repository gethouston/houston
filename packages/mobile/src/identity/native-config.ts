import { Capacitor } from "@capacitor/core";
import { authBootBreadcrumbs, providerAvailability } from "./availability";

declare const __HOUSTON_NATIVE_AUTH_IOS_CONFIG__: boolean;
declare const __HOUSTON_NATIVE_AUTH_ANDROID_CONFIG__: boolean;
declare const __HOUSTON_NATIVE_APPLE_SERVICE_ID__: string;

const platform = Capacitor.getPlatform();
const config = {
  iosFirebase: __HOUSTON_NATIVE_AUTH_IOS_CONFIG__,
  androidFirebase: __HOUSTON_NATIVE_AUTH_ANDROID_CONFIG__,
  appleServiceId: __HOUSTON_NATIVE_APPLE_SERVICE_ID__,
};

export const nativeIdentity = {
  providers: providerAvailability(
    platform === "ios" ? "ios" : "android",
    config,
  ),
};

export function logAuthAvailability(): void {
  for (const message of authBootBreadcrumbs(
    platform === "ios" ? "ios" : "android",
    config,
  ))
    console.warn(message);
}
