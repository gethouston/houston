import type { WireFrame } from "./types";

export interface ReadEventStreamOptions {
  onParseError?: (line: string, err: unknown) => void;
}

export async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (frame: WireFrame) => void | Promise<void>,
  onActivity?: () => void,
  options?: ReadEventStreamOptions,
): Promise<void> {
  const reader = body.getReader();
  reader.closed.catch(() => {});
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
      if (!line) continue;
      const payload = line.slice(5).trim();
      let parsed: WireFrame;
      try {
        parsed = JSON.parse(payload) as WireFrame;
      } catch (err) {
        if (!options?.onParseError) throw err;
        options.onParseError(payload, err);
        continue;
      }
      await onEvent(parsed);
    }
  }
}
