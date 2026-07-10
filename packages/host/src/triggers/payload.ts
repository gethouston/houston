/** JSON-stringified byte ceiling for a stored trigger payload (contract C9 #3). */
export const MAX_PAYLOAD_BYTES = 64 * 1024;

/**
 * Cap a webhook payload at 64KB (JSON-stringified). A trigger event is a
 * NOTIFICATION, not the authoritative content — the agent fetches the real thing
 * through its granted tools — so an oversized body is replaced by a truncated
 * marker carrying a prefix, never dropped and never stored unbounded. Also framed
 * as untrusted data downstream (routineTriggerPrompt), so a hostile large body
 * cannot bloat the run.
 */
export function truncateEventPayload(
  data: unknown,
  maxBytes: number = MAX_PAYLOAD_BYTES,
): unknown {
  const json = JSON.stringify(data ?? null);
  if (Buffer.byteLength(json, "utf8") <= maxBytes) return data;
  return {
    _truncated: true,
    _bytes: Buffer.byteLength(json, "utf8"),
    // Slice on the string (chars) but keep it under the byte ceiling — leave
    // headroom for the wrapping keys so the whole marker stays within budget.
    preview: json.slice(0, Math.max(0, maxBytes - 256)),
  };
}
