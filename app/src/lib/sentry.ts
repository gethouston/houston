import * as Sentry from "@sentry/browser";
import {
  defaultOptions as tauriSentryDefaults,
  makeRendererTransport,
} from "tauri-plugin-sentry-api";
import { isReplayEnvelope } from "./sentry-replay";

// __SENTRY_DSN__ baked at build time by Vite (see vite.config.ts). Empty
// string in dev / forks → init bails, every capture is a silent no-op.
const DSN = typeof __SENTRY_DSN__ !== "undefined" ? __SENTRY_DSN__ : "";

// Release MUST match what the Rust SDK reports (sentry::release_name!() in
// lib.rs) AND what release.yml uploads sourcemaps + debug-files under,
// otherwise stack traces won't resolve.
const RELEASE = `houston-app@${
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "0.0.0"
}`;

// Session Replay sampling. Sentry's guidance: record a small slice of normal
// sessions, but a replay for EVERY session that hits an error. Replay only runs
// in builds that bake a DSN (CI release), so dev/forks never record. While
// actively QA-ing replay, temporarily bump SESSION_SAMPLE_RATE to 1.0.
const REPLAYS_SESSION_SAMPLE_RATE = 0.1;
const REPLAYS_ON_ERROR_SAMPLE_RATE = 1.0;

let initialized = false;

/**
 * Init Sentry on the frontend. `defaultOptions` from tauri-plugin-sentry-api
 * pipes the JS transport + breadcrumbs through Tauri IPC into the Rust
 * Sentry SDK — single endpoint, single release tag, no duplicate events
 * even though both lib.rs (Rust) and main.tsx (JS) call sentry::init.
 *
 * Session Replay is the exception: replay envelopes can't survive the IPC hop
 * (the Rust SDK's envelope parser has no `replay_event` / `replay_recording`
 * variant, so tauri-plugin-sentry drops them). We install a split transport
 * that sends replay envelopes straight to Sentry over HTTP and keeps every
 * other envelope on the Rust IPC path. See ./sentry-replay.
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
    // Strip sensitive query params from URLs in breadcrumbs. Also keep PII off
    // for Session Replay — Houston serves non-technical users whose chat
    // messages, prompts, agent + workspace names and file paths must never
    // enter a recording (the masking integration options below enforce this).
    sendDefaultPii: false,
    // Split transport: replay -> direct HTTP, everything else -> Rust via IPC.
    transport: (options) => {
      const ipcTransport = makeRendererTransport(options);
      const fetchTransport = Sentry.makeFetchTransport(options);
      return {
        send: (envelope) =>
          isReplayEnvelope(envelope)
            ? fetchTransport.send(envelope)
            : ipcTransport.send(envelope),
        flush: (timeout) =>
          Promise.all([
            ipcTransport.flush(timeout),
            fetchTransport.flush(timeout),
          ]).then((results) => results.every(Boolean)),
      };
    },
    integrations: (defaultIntegrations) => [
      // tauri-plugin-sentry strips BrowserSession (app sessions are tracked in
      // Rust, not browser sessions). Preserve that, then add Session Replay.
      ...defaultIntegrations.filter(
        (integration) => integration.name !== "BrowserSession",
      ),
      Sentry.replayIntegration({
        // Privacy-first: mask all text + inputs and block media so recordings
        // capture layout/interaction shape, never readable user content. These
        // are Sentry's defaults; set explicitly so the posture is auditable.
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    ],
    replaysSessionSampleRate: REPLAYS_SESSION_SAMPLE_RATE,
    replaysOnErrorSampleRate: REPLAYS_ON_ERROR_SAMPLE_RATE,
  });
}

/**
 * Capture an exception and wait for the frontend transport to flush. Returns
 * the event ID only when the SDK confirms the pending envelope left its queue.
 * This is still not a Sentry ingestion guarantee, but it prevents the app from
 * showing a "reported" toast for events that never reached the transport.
 */
export async function captureException(
  error: unknown,
  context?: Record<string, string>,
): Promise<string> {
  if (!initialized) return "";
  const normalized = error instanceof Error ? error : new Error(String(error));
  const eventId = Sentry.captureException(
    normalized,
    context ? { tags: context } : undefined,
  );
  const flushed = await Sentry.flush(5000);
  return flushed ? eventId : "";
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
