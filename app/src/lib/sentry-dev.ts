// Dev-mode Sentry gate. Houston bakes the prod `SENTRY_DSN` into official
// builds, so a developer running `pnpm tauri dev` with that DSN exported (or
// sitting in `app/.env.local`) would otherwise send development errors —
// including the deliberate `Ctrl+Alt+Shift+J/N` smoke triggers — straight into
// the production `houston-app` project. The `environment: development` tag is a
// soft filter, not a gate: those events still eat quota, fire the "new issue"
// Slack alert, and clutter issue lists. So dev builds DON'T send by default.
//
// The escape hatch is the `SENTRY_SEND_IN_DEV` flag: set it (truthy) to send
// from dev anyway, which is exactly the switch you want when actively testing
// crash reporting locally. Release builds ignore it entirely.

/**
 * Parse the `SENTRY_SEND_IN_DEV` opt-in flag. Truthy values (`1`, `true`,
 * `yes`, `on`, any case, surrounding whitespace ignored) enable sending from a
 * dev build; everything else (including unset/empty) leaves dev sending off.
 */
export function sentrySendInDevEnabled(raw: string | undefined): boolean {
  if (!raw) return false;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

// Dev-only toast copy shown in place of the green "report sent" toast when a
// dev build suppresses Sentry. Intentionally English-only and NOT routed
// through i18n: it is a message for us (developers), never reachable by a
// real es/pt end user, who only ever runs release builds.
export const DEV_NO_SEND_TITLE = "You're in dev mode, no issue sent.";
export const DEV_NO_SEND_DESCRIPTION =
  "Set SENTRY_SEND_IN_DEV=1 to send issues to Sentry in dev mode.";

export interface DevNoSendToast {
  title: string;
  description: string;
  variant: "info";
}

/**
 * The toast shown in place of the green "report sent" toast whenever a dev
 * build suppresses Sentry — used by both the error path (`error-toast`) and the
 * native smoke trigger (`sentry-smoke`) so every suppressed-dev surface tells
 * the developer the same thing. Pure (no UI-store dependency) so it can be
 * unit-tested.
 */
export function devNoSendToastSpec(): DevNoSendToast {
  return {
    title: DEV_NO_SEND_TITLE,
    description: DEV_NO_SEND_DESCRIPTION,
    variant: "info",
  };
}
