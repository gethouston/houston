import type { WireEvent } from "@houston/runtime-client";

/**
 * Pump `data: <WireEvent JSON>` SSE frames out of a fetch body. Comments and
 * heartbeats (lines starting with ":") are skipped; a malformed data line
 * throws — a garbled turn stream must surface, not silently drop frames.
 */
export async function pumpSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (e: WireEvent) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      for (const line of frame.split("\n")) {
        if (line.startsWith("data: ")) {
          onEvent(JSON.parse(line.slice(6)) as WireEvent);
        }
      }
    }
  }
}
