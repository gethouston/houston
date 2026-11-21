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
    const n =
      typeof options === "string"
        ? new Notification(options)
        : new Notification(options.title, { body: options.body });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {}
}

export interface ActionRegistration {
  unregister: () => void;
}

export async function onAction(
  _cb: (notification: unknown) => void,
): Promise<ActionRegistration> {
  return { unregister: () => {} };
}
