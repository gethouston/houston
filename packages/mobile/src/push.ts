import { Capacitor } from "@capacitor/core";
import { FirebaseMessaging } from "@capacitor-firebase/messaging";
import type { NativeShell } from "../../web/src/shims/native-shell";

declare const __HOUSTON_NATIVE_PUSH_IOS_AVAILABLE__: boolean;
declare const __HOUSTON_NATIVE_PUSH_ANDROID_AVAILABLE__: boolean;

let pendingTap: unknown = null;
const tapListeners = new Set<(data: unknown) => void>();
export async function installEarlyPushTap(): Promise<void> {
  if (!mobilePush.available) return;
  await FirebaseMessaging.addListener(
    "notificationActionPerformed",
    ({ notification }) => {
      if (tapListeners.size === 0) pendingTap = notification.data;
      else for (const listener of tapListeners) listener(notification.data);
    },
  );
}

const permission = (value: string): "granted" | "denied" | "default" =>
  value === "granted" ? "granted" : value === "denied" ? "denied" : "default";

export const mobilePush: NativeShell["push"] = {
  available:
    Capacitor.getPlatform() === "ios"
      ? __HOUSTON_NATIVE_PUSH_IOS_AVAILABLE__
      : __HOUSTON_NATIVE_PUSH_ANDROID_AVAILABLE__,
  async permissionState() {
    if (!this.available) return "denied";
    return permission((await FirebaseMessaging.checkPermissions()).receive);
  },
  async requestPermission() {
    if (!this.available) return "denied";
    return permission((await FirebaseMessaging.requestPermissions()).receive);
  },
  async getToken() {
    return (await FirebaseMessaging.getToken()).token;
  },
  deleteToken: () => FirebaseMessaging.deleteToken(),
  async onTokenRefresh(listener) {
    if (!this.available) return async () => {};
    const handle = await FirebaseMessaging.addListener(
      "tokenReceived",
      ({ token }) => listener(token),
    );
    return () => handle.remove();
  },
  async onNotificationTap(listener) {
    if (!this.available) return async () => {};
    tapListeners.add(listener);
    if (pendingTap !== null) {
      const data = pendingTap;
      pendingTap = null;
      listener(data);
    }
    return async () => {
      tapListeners.delete(listener);
    };
  },
};
