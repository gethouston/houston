/**
 * Web shim for `@tauri-apps/plugin-notification`.
 *
 * Maps the plugin surface app/src uses onto the browser Notification API:
 *  - isPermissionGranted / requestPermission / sendNotification
 *    (app/src/hooks/session-notifications.ts, macOS path)
 *  - onAction (app/src/hooks/use-session-events.ts) — the web Notification API
 *    has per-notification onclick, not a global action bus, so this is a no-op.
 */

export type Permission =
  | "granted"
  | "denied"
  | "default"
  | "prompt"
  | "prompt-with-rationale";

export async function isPermissionGranted(): Promise<boolean> {
  return (
    typeof Notification !== "undefined" && Notification.permission === "granted"
  );
}

export async function requestPermission(): Promise<Permission> {
  if (typeof Notification === "undefined") return "denied";
  try {
    return (await Notification.requestPermission()) as Permission;
  } catch {
    return "denied";
  }
}

export interface Options {
  title: string;
  body?: string;
  sound?: string;
}

export function sendNotification(options: Options | string): void {
  try {
    if (
      typeof Notification === "undefined" ||
      Notification.permission !== "granted"
    ) {
      return;
    }
    // The web API has no `sound` option; it's ignored. Wire onclick to
    // window.focus() so the app's focus-proxy nav path (session-notifications)
    // fires on web the same way it does on desktop.
    const n =
      typeof options === "string"
        ? new Notification(options)
        : new Notification(options.title, { body: options.body });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* notifications blocked / unavailable */
  }
}

/** Mirrors the plugin's `onAction` registration handle (`.unregister()`). */
export interface ActionRegistration {
  unregister: () => void;
}

export async function onAction(
  _cb: (notification: unknown) => void,
): Promise<ActionRegistration> {
  // No global notification-action bus in the browser.
  return { unregister: () => {} };
}
