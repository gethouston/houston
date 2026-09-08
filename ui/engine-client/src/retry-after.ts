/**
 * The `Retry-After` hint, read once and read here.
 *
 * Houston's hosts and the cloud gateway both answer "not yet, ask again" with
 * `503 + Retry-After` (`packages/host/src/channel/probe-wake.ts`, the gateway's
 * wake path). The number is the SERVER's estimate of when its pod will be
 * ready, which is strictly better information than any client-side backoff
 * curve — so it is captured onto `HoustonEngineError.retryAfterMs` and the
 * schedulers that care (assistant discovery, the query layer) prefer it.
 *
 * CROSS-ORIGIN: a browser only exposes this header to JS when the responder
 * lists it in `Access-Control-Expose-Headers` — Houston's host does
 * (`packages/host/src/server.ts` `applyCors`). Against a responder that does
 * not, the header simply reads as absent and every caller falls back to its own
 * schedule; nothing breaks, the hint is just unavailable.
 */

/** A header bag this module can read. `Headers` satisfies it; so does a stub. */
interface HeaderReader {
  get(name: string): string | null;
}

/**
 * Every HTTP-date form RFC 9110 permits starts with the day of the week
 * (`Wed, 21 Oct 2026 …`, `Wednesday, 21-Oct-26 …`, `Wed Oct 21 …`), so this is
 * the gate the date branch opens on.
 *
 * `Date.parse` alone is NOT that gate: it is allowed to accept
 * implementation-defined strings, and V8 reads `"-5"` as a year and `"NaN"` as
 * a date — so a garbage header would have produced a real, wrong duration.
 */
const HTTP_DATE_START = /^(mon|tue|wed|thu|fri|sat|sun)/i;

/**
 * Parse an HTTP `Retry-After` value into milliseconds.
 *
 * RFC 9110 allows two forms and both appear on Houston's wire: delay-seconds
 * (`Retry-After: 2`, what the host and gateway send) and an HTTP-date
 * (`Retry-After: Wed, 21 Oct 2026 07:28:00 GMT`, what some intermediaries
 * rewrite it to). Anything else — absent, empty, prose, a negative or
 * fractional count, an unparseable date — answers `undefined` rather than a
 * guess: a caller that sleeps on garbage is worse off than one that falls back
 * to its own backoff. A date already in the past clamps to 0 ("retry now"),
 * which is what the server means by it.
 */
export function parseRetryAfterMs(
  value: string | null | undefined,
  now: number = Date.now(),
): number | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  // delay-seconds is defined as digits only, so this rejects "-5", "1.5" and
  // "2 seconds" before Date.parse ever sees them.
  if (/^\d+$/.test(raw)) {
    const ms = Number(raw) * 1000;
    return Number.isFinite(ms) ? ms : undefined;
  }
  if (!HTTP_DATE_START.test(raw)) return undefined;
  const at = Date.parse(raw);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

/** The `Retry-After` hint carried by a response, in milliseconds. */
export function retryAfterMsOf(
  headers: HeaderReader,
  now?: number,
): number | undefined {
  return parseRetryAfterMs(headers.get("Retry-After"), now);
}
