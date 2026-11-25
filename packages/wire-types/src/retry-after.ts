interface HeaderReader {
  get(name: string): string | null;
}

const HTTP_DATE_START = /^(mon|tue|wed|thu|fri|sat|sun)/i;

// WHY: V8 Date.parse accepts "-5" and "NaN"; require a weekday before parsing a date. ADR-0018
export function parseRetryAfterMs(
  value: string | null | undefined,
  now: number = Date.now(),
): number | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  if (/^\d+$/.test(raw)) {
    const ms = Number(raw) * 1000;
    return Number.isFinite(ms) ? ms : undefined;
  }
  if (!HTTP_DATE_START.test(raw)) return undefined;
  const at = Date.parse(raw);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

export function retryAfterMsOf(
  headers: HeaderReader,
  now?: number,
): number | undefined {
  return parseRetryAfterMs(headers.get("Retry-After"), now);
}
