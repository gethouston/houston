// Pure helpers for Houston's Sentry transport + delivery confirmation.
//
// Imported BOTH by the browser Sentry init (lib/sentry.ts) and by the Node
// test runner, so this module stays dependency-free: no @sentry/browser, no
// DOM. Only structural types + plain logic.
//
// Why delivery confirmation: Houston sends renderer events straight to Sentry
// over HTTP (@sentry/browser's fetch transport). lib/sentry.ts wraps that
// transport so each send's real HTTP outcome is recorded per event id, and
// only surfaces an event id (the green "report sent" toast) once Sentry has
// actually accepted the event with a 2xx. The previous Tauri-IPC transport
// could not do this — it reported success unconditionally, so the toast could
// show an id for an event that never reached Sentry.

/**
 * Minimal structural shape of a Sentry envelope: a `[header, …items]` tuple
 * whose header may carry an `event_id`. The real `Envelope` type is assignable
 * to this — we only read `header.event_id`, so we avoid importing the SDK type.
 *
 * The header is `& Record<string, unknown>` (NOT a bare `{ event_id?: string }`)
 * on purpose: `Envelope` is a union and several members (SessionEnvelope,
 * ClientReportEnvelope, …) have headers with no `event_id`. A bare optional-only
 * header is a TS "weak type" and the union members share no named property with
 * it, so assignment is rejected. The index signature makes it non-weak.
 */
export type EnvelopeLike = readonly [
  { event_id?: string } & Record<string, unknown>,
  ...unknown[],
];

/**
 * Sentry accepted the event iff the transport response is a 2xx — or carries no
 * status code at all, which the fetch transport reports for a completed send
 * with no explicit HTTP status. A rejected send (network error / timeout) never
 * reaches this with a status; the caller treats that as not-accepted.
 */
export function isAcceptedStatus(statusCode: number | undefined): boolean {
  return statusCode === undefined || (statusCode >= 200 && statusCode < 300);
}

/** Pull the event id from an envelope header, if present. */
export function eventIdFromEnvelope(envelope: EnvelopeLike): string | undefined {
  const header = envelope[0];
  return typeof header?.event_id === "string" ? header.event_id : undefined;
}

/**
 * The event id to surface to the user: only when the transport BOTH flushed
 * AND Sentry accepted the event (2xx). Otherwise "" so the caller does NOT show
 * a "report sent" confirmation it can't honor (offline, timeout, 4xx/429,
 * sampled/dropped).
 */
export function resolveCapturedEventId(
  eventId: string,
  flushed: boolean,
  accepted: boolean,
): string {
  return flushed && accepted ? eventId : "";
}
