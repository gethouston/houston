// Stable Sentry issue grouping for renderer events (HOU-449).
//
// Every renderer error reaches Sentry through `captureException` in `./sentry.ts`
// as a synthetic `Error` whose `name` is the engine-client command and whose
// `message` is the raw failure string (see `createSentryReportError`). That
// message routinely carries volatile data — most visibly the local sidecar's
// RANDOM port in "Failed to fetch (127.0.0.1:<port>)" — so Sentry's default
// name+value grouping fans ONE transport drop out into a brand-new issue per
// port (dozens of duplicate issues at last count).
//
// `beforeSend` (wired in `./sentry.ts`) runs these helpers to stamp a
// deterministic fingerprint computed from the message with volatile tokens
// masked, collapsing each family into ONE issue. Mirrors the engine's
// `engine/houston-engine-server/src/sentry_grouping.rs`.

// A UUID anywhere in the string (agent / workspace / session ids, composio keys).
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
// An IPv4 address with an optional `:port` — the sidecar's `127.0.0.1:<random>`.
const IPV4 = /\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g;
// A hex literal — `0xc000001d` Windows status codes, pointers.
const HEX = /\b0x[0-9a-f]+\b/gi;
// Any remaining run of digits — serde line/column, byte indices, os error codes.
const DIGITS = /\d+/g;
// Collapsible whitespace.
const WHITESPACE = /\s+/g;
const MAX_KEY_LEN = 200;

/**
 * Normalize a message into a stable grouping key: first line only, every
 * volatile token masked, whitespace collapsed, trimmed, and length capped.
 * Pure, so it can be unit-tested against verbatim Sentry titles.
 *
 * Ordering matters: UUID / IPv4 / hex are masked BEFORE the bare-digit pass so
 * their internal digits aren't half-eaten into `{n}` first. Reusing these
 * module-level `g`-flag regexes across calls is safe — `String.replace` does
 * not carry `lastIndex` state between calls (only `.test`/`.exec` do).
 */
export function normalizeFingerprintMessage(raw: string): string {
  const firstLine = raw.split("\n", 1)[0] ?? raw;
  return firstLine
    .replace(UUID, "{uuid}")
    .replace(IPV4, "{addr}")
    .replace(HEX, "{hex}")
    .replace(DIGITS, "{n}")
    .replace(WHITESPACE, " ")
    .trim()
    .slice(0, MAX_KEY_LEN);
}

/**
 * The slice of a Sentry event we read for grouping. Kept structural so this
 * module stays decoupled from the `@sentry/browser` type surface.
 */
export interface FingerprintableEvent {
  exception?: { values?: Array<{ value?: string }> };
  message?: string;
}

/**
 * Compute a one-element fingerprint for an event, or `undefined` when there is
 * no usable message to key on (let Sentry group it by default — never collapse
 * unrelated empty events into one bucket). The exception value wins over a bare
 * message: that's where `captureException` puts the real failure string.
 */
export function fingerprintForEvent(
  event: FingerprintableEvent,
): string[] | undefined {
  const values = event.exception?.values;
  const fromException =
    values && values.length > 0 ? values[values.length - 1]?.value : undefined;
  const raw = fromException ?? event.message;
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const key = normalizeFingerprintMessage(raw);
  return key === "" ? undefined : [key];
}
