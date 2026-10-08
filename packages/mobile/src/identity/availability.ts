import type { NativeShell } from "../../../web/src/shims/native-shell";

export type MobilePlatform = "ios" | "android";

export interface IdentityConfigPresence {
  iosFirebase: boolean;
  androidFirebase: boolean;
  appleServiceId: string;
}

export function providerAvailability(
  platform: MobilePlatform,
  config: IdentityConfigPresence,
): NativeShell["identity"]["providers"] {
  const firebase =
    platform === "ios" ? config.iosFirebase : config.androidFirebase;
  return {
    google: firebase,
    apple: firebase && !!config.appleServiceId,
    // Capawesome's Firebase JS SDK guide explicitly excludes Microsoft with
    // skipNativeAuth: https://github.com/capawesome-team/capacitor-firebase/blob/main/packages/authentication/docs/firebase-js-sdk.md#quirks
    azure: false,
  };
}

export function authBootBreadcrumbs(
  platform: MobilePlatform,
  config: IdentityConfigPresence,
): string[] {
  const messages: string[] = [];
  if (platform === "ios" && !config.iosFirebase)
    messages.push(
      "[mobile/auth] Google and Apple OFF: add ios/App/App/GoogleService-Info.plist and sync.",
    );
  if (platform === "android" && !config.androidFirebase)
    messages.push(
      "[mobile/auth] Google and Apple OFF: add android/app/google-services.json and sync.",
    );
  if (firebasePresent(platform, config) && !config.appleServiceId)
    messages.push(
      "[mobile/auth] Apple OFF: configure the Apple Services ID in Firebase, then set FIREBASE_APPLE_SERVICE_ID when building.",
    );
  messages.push(
    "[mobile/auth] Microsoft OFF: Capawesome cannot bridge Microsoft to Firebase JS SDK with skipNativeAuth.",
  );
  return messages;
}

function firebasePresent(
  platform: MobilePlatform,
  config: IdentityConfigPresence,
): boolean {
  return platform === "ios" ? config.iosFirebase : config.androidFirebase;
}
