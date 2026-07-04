import type { WireFrame } from "./types";

/** Tuning for {@link readEventStream}'s handling of unparseable data lines. */
export interface ReadEventStreamOptions {
  /**
   * Tolerant mode. When set, a `data:` line that is not valid JSON is reported
   * here (with the raw payload and the parse error) and skipped instead of
   * throwing — for long-lived global feeds where one garbled frame must not
   * tear down the subscription. Absent (the default), a malformed line rejects
   * the read, so strict per-turn consumers still surface a garbled stream.
   */
  onParseError?: (line: string, err: unknown) => void;
}

/**
 * Read one SSE response body to completion, parsing each `data: <json>` frame
 * into a wire frame. SSE comment frames (": connected", ": hb" heartbeats)
 * never reach `onEvent`, but `onActivity` fires on EVERY received chunk —
 * comments included — so idle watchdogs can tell a healthy-but-quiet stream
 * from a wedged connection. `onEvent` may return a promise; it is awaited
 * before the next frame is parsed, so a consumer with async per-frame work
 * (the host relay's snapshot persist + broadcast) keeps the stream's
 * ordering. Resolves when the stream ends; rejects on a transport error or
 * abort. A malformed data line rejects too UNLESS `options.onParseError` opts
 * into tolerant mode, where it is reported and skipped (a garbled frame must
 * surface for strict consumers, but must not kill a global reactivity feed).
 */
export async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (frame: WireFrame) => void | Promise<void>,
  onActivity?: () => void,
  options?: ReadEventStreamOptions,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onActivity?.();
    buf += decoder.decode(value, { stream: true });
    let idx = buf.indexOf("\n\n");
    while (idx >= 0) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      idx = buf.indexOf("\n\n");
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue; // an SSE comment / id-only frame — no payload
      const payload = line.slice(5).trim();
      let parsed: WireFrame;
      try {
        parsed = JSON.parse(payload) as WireFrame;
      } catch (err) {
        if (!options?.onParseError) throw err;
        options.onParseError(payload, err); // tolerant: report and skip
        continue;
      }
      await onEvent(parsed);
    }
  }
}
