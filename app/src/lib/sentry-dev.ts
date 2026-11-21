export function sentrySendInDevEnabled(raw: string | undefined): boolean {
  if (!raw) return false;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

export const DEV_NO_SEND_TITLE = "You're in dev mode, no issue sent.";
export const DEV_NO_SEND_DESCRIPTION =
  "Set SENTRY_SEND_IN_DEV=1 to send issues to Sentry in dev mode.";

export interface DevNoSendToast {
  title: string;
  description: string;
  variant: "info";
}

export function devNoSendToastSpec(): DevNoSendToast {
  return {
    title: DEV_NO_SEND_TITLE,
    description: DEV_NO_SEND_DESCRIPTION,
    variant: "info",
  };
}
