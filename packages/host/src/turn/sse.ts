import type { WireEvent } from "@houston/runtime-client";

/**
 * Pump `data: <WireEvent JSON>` SSE frames out of a fetch body. Comments and
 * heartbeats (lines starting with ":") are skipped; a malformed data line
 * throws — a garbled turn stream must surface, not silently drop frames.
 * Each event is awaited before the next is parsed so the relay's snapshot
 * writes + broadcasts keep the stream's ordering.
 */
export async function pumpSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (e: WireEvent) => void | Promise<void>,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let sep = buf.indexOf("\n\n");
    while (sep >= 0) {
      const frame = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      sep = buf.indexOf("\n\n");
      for (const line of frame.split("\n")) {
        if (line.startsWith("data: ")) {
          await onEvent(JSON.parse(line.slice(6)) as WireEvent);
        }
      }
    }
  }
}
