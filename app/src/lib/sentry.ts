import * as Sentry from "@sentry/browser";
import {
  eventIdFromEnvelope,
  isAcceptedStatus,
  resolveCapturedEventId,
} from "./sentry-transport";
import { sentrySendInDevEnabled } from "./sentry-dev";

// __SENTRY_DSN__ baked at build time by Vite (see vite.config.ts). Empty
// string in dev / forks → init bails, every capture is a silent no-op.
const DSN = typeof __SENTRY_DSN__ !== "undefined" ? __SENTRY_DSN__ : "";

// Opt-in (truthy __SENTRY_SEND_IN_DEV__) to send Sentry events from a dev
// build. Unset by default.
const SEND_IN_DEV = sentrySendInDevEnabled(
  typeof __SENTRY_SEND_IN_DEV__ !== "undefined" ? __SENTRY_SEND_IN_DEV__ : "",
);

/**
 * True when this is a dev build (`pnpm tauri dev`) and the SENTRY_SEND_IN_DEV
 * opt-in is NOT set. In that state Sentry is hard-disabled — `initSentry` bails
 * so nothing reaches the prod project — and `error-toast` surfaces a dev-only
 * "no issue sent" notice instead of the green "report sent" toast. Release
 * builds are never suppressed (`import.meta.env.DEV` is false).
 */
export const sentrySuppressedInDev = import.meta.env.DEV && !SEND_IN_DEV;

// Release MUST match what the Rust SDK reports (the explicit
// `houston-app@<CARGO_PKG_VERSION>` in lib.rs) AND what release.yml uploads
// sourcemaps + debug-files under, otherwise stack traces won't resolve.
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

// Per-event delivery outcome recorded by the confirming transport (below) and
// read+cleared by captureException: true once Sentry accepts the event with a
// 2xx. Bounded so it can't grow unboundedly from envelopes captured outside
// captureException (replay envelopes carry no header event_id; the SDK's own
// GlobalHandlers integration is stripped — see initSentry).
const deliveryAccepted = new Map<string, boolean>();
const MAX_TRACKED_DELIVERIES = 64;

function recordDelivery(eventId: string, accepted: boolean): void {
  if (deliveryAccepted.size >= MAX_TRACKED_DELIVERIES) {
    const oldest = deliveryAccepted.keys().next().value;
    if (oldest !== undefined) deliveryAccepted.delete(oldest);
  }
  deliveryAccepted.set(eventId, accepted);
}

/**
 * Init Sentry on the frontend.
 *
 * Transport: renderer events go STRAIGHT to Sentry over HTTP
 * (`makeFetchTransport`), NOT through the tauri-plugin-sentry IPC bridge. The
 * IPC path silently dropped `@sentry/browser` 10.x error envelopes in packaged
 * builds (the plugin's Rust `sentry-types` parser rejected the newer envelope
 * and discarded it with no logging), so JS errors never reached Sentry while
 * `flush()` still reported success. Direct HTTP is the path Session Replay
 * already used successfully, so it's proven to work from the Tauri webview.
 * Native (Rust) crash reporting is unaffected — it's the `sentry` crate's panic
 * handler from `sentry::init` in lib.rs, not this transport.
 *
 * The transport is wrapped to record each send's real HTTP outcome per event
 * id, so captureException can confirm Sentry actually accepted an event before
 * the "report sent" toast claims so.
 *
 * Fire-and-forget. Empty DSN → silent no-op (local dev without secrets).
 * Dev build without the SENTRY_SEND_IN_DEV opt-in → also a no-op, so dev
 * errors never reach the prod Sentry project (see `sentrySuppressedInDev`).
 */
export function initSentry(): void {
  if (initialized || !DSN || sentrySuppressedInDev) return;
  initialized = true;

  Sentry.init({
    dsn: DSN,
    release: RELEASE,
    environment: import.meta.env.DEV ? "development" : "production",
    // Keep PII off for Session Replay — Houston serves non-technical users
    // whose chat messages, prompts, agent + workspace names and file paths must
    // never enter a recording (the masking integration options below enforce
    // this).
    sendDefaultPii: false,
    // Direct HTTP transport, wrapped to record real per-event delivery.
    transport: (options) => {
      const inner = Sentry.makeFetchTransport(options);
      return {
        send: async (envelope) => {
          const eventId = eventIdFromEnvelope(envelope);
          try {
            const response = await inner.send(envelope);
            if (eventId) {
              recordDelivery(eventId, isAcceptedStatus(response?.statusCode));
            }
            return response;
          } catch (err) {
            // Network error / timeout: the event did NOT reach Sentry.
            if (eventId) recordDelivery(eventId, false);
            throw err;
          }
        },
        flush: (timeout) => inner.flush(timeout),
      };
    },
    integrations: (defaultIntegrations) => [
      // - BrowserSession: app release-health sessions are tracked in Rust
      //   (lib.rs auto_session_tracking), so drop the browser one to avoid
      //   double counting.
      // - GlobalHandlers: uncaught errors + unhandled rejections are captured
      //   AND toasted explicitly in main.tsx (so the user gets the event id);
      //   drop the SDK's auto-capture to avoid duplicate events.
      ...defaultIntegrations.filter(
        (integration) =>
          integration.name !== "BrowserSession" &&
          integration.name !== "GlobalHandlers",
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
 * Capture an exception and return its Sentry event id ONLY once the transport
 * flushed AND Sentry accepted the event with a 2xx. Otherwise returns "" so the
 * caller never shows a "report sent" confirmation for an event that didn't
 * actually land (offline, timeout, rate-limited, sampled/dropped). This is a
 * real send/accept confirmation — the direct fetch transport's flush waits for
 * the HTTP round-trip, unlike the old IPC transport which reported success
 * unconditionally.
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
  // By the time flush resolves, the wrapper's send() has run for this envelope
  // and recorded its outcome. The exact microtask ordering isn't guaranteed, so
  // a missing entry is treated as not-accepted — worst case a real send shows no
  // green toast (conservative), never a false "report sent".
  const accepted = deliveryAccepted.get(eventId) === true;
  deliveryAccepted.delete(eventId);
  return resolveCapturedEventId(eventId, flushed, accepted);
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
