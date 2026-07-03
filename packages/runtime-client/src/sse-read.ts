import type { WireFrame } from "./types";

/**
 * Read one SSE response body to completion, parsing each `data: <json>` frame
 * into a wire frame. SSE comment frames (": connected", ": hb" heartbeats)
 * never reach `onEvent`, but `onActivity` fires on EVERY received chunk —
 * comments included — so idle watchdogs can tell a healthy-but-quiet stream
 * from a wedged connection. `onEvent` may return a promise; it is awaited
 * before the next frame is parsed, so a consumer with async per-frame work
 * (the host relay's snapshot persist + broadcast) keeps the stream's
 * ordering. Resolves when the stream ends; rejects on a transport error,
 * abort, or a malformed data line (a garbled stream must surface, not
 * silently drop frames).
 */
export async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (frame: WireFrame) => void | Promise<void>,
  onActivity?: () => void,
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
      await onEvent(JSON.parse(line.slice(5).trim()) as WireFrame);
    }
  }
}
