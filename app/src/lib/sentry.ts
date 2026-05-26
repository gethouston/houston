import * as Sentry from "@sentry/browser";
import { defaultOptions as tauriSentryDefaults } from "tauri-plugin-sentry-api";

// __SENTRY_DSN__ baked at build time by Vite (see vite.config.ts). Empty
// string in dev / forks → init bails, every capture is a silent no-op.
const DSN = typeof __SENTRY_DSN__ !== "undefined" ? __SENTRY_DSN__ : "";

// Release MUST match what the Rust SDK reports (sentry::release_name!() in
// lib.rs) AND what release.yml uploads sourcemaps + debug-files under,
// otherwise stack traces won't resolve.
const RELEASE = `houston-app@${
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0"
}`;

let initialized = false;

/**
 * Init Sentry on the frontend. `defaultOptions` from tauri-plugin-sentry-api
 * pipes the JS transport + breadcrumbs through Tauri IPC into the Rust
 * Sentry SDK — single endpoint, single release tag, no duplicate events
 * even though both lib.rs (Rust) and main.tsx (JS) call sentry::init.
 *
 * Fire-and-forget. Empty DSN → silent no-op (local dev without secrets).
 */
export function initSentry(): void {
  if (initialized || !DSN) return;
  initialized = true;

  Sentry.init({
    ...tauriSentryDefaults,
    dsn: DSN,
    release: RELEASE,
    environment: import.meta.env.DEV ? "development" : "production",
    // Strip sensitive query params from URLs in breadcrumbs.
    sendDefaultPii: false,
  });
}

/**
 * Capture an exception synchronously. Returns the event ID Sentry assigned,
 * suitable for surfacing in a toast ("Reported as #abc12345"). Returns
 * empty string if Sentry isn't initialized (no DSN).
 */
export function captureException(error: unknown, context?: Record<string, string>): string {
  if (!initialized) return "";
  const normalized = error instanceof Error ? error : new Error(String(error));
  return Sentry.captureException(normalized, context ? { tags: context } : undefined);
}

/**
 * Tag every subsequent event with the signed-in user. Call on sign-in.
 * Email is sent so it's queryable in the Sentry dashboard for B2B triage,
 * matching the PostHog person-property convention. No-op if not init'd.
 */
export function setUser(user: { id: string; email?: string | null }): void {
  if (!initialized) return;
  Sentry.setUser({
    id: user.id,
    email: user.email ?? undefined,
  });
}

/** Clear user identity on sign-out. */
export function clearUser(): void {
  if (!initialized) return;
  Sentry.setUser(null);
}
