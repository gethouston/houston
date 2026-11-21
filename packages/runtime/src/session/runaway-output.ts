import {
  CLOSER_SHAPE,
  closes,
  endsContainer,
  FENCE_LINE_MAX,
  FENCE_PREFIX,
  type Fence,
  opens,
} from "./markdown-fence";

export const LOOP_WINDOW_CHARS = 4096;
export const LOOP_MAX_DISTINCT = 64;
const JUDGE_EVERY_CHARS = 512;

export type StreamedKind = "text" | "thinking";

export function isRepetitionLoop(window: string): boolean {
  if (window.length < LOOP_WINDOW_CHARS) return false;
  const seen = new Set<string>();
  for (let i = 0; i + 4 <= window.length; i++) {
    seen.add(window.slice(i, i + 4));
    if (seen.size > LOOP_MAX_DISTINCT) return false;
  }
  return true;
}

export interface RunawayDetector {
  feed(kind: StreamedKind, delta: string): boolean;
  reset(): void;
}

interface Stream {
  tail: string;
  unjudged: number;
  fence: Fence | null;
  line: string | null;
}

export function createRunawayDetector(): RunawayDetector {
  const streams = new Map<StreamedKind, Stream>();
  const judged = (stream: Stream, text: string) => {
    if (stream.fence || !text) return;
    stream.tail = (stream.tail + text).slice(-LOOP_WINDOW_CHARS);
    stream.unjudged += text.length;
  };
  const fenceChanged = (stream: Stream, fence: Fence | null) => {
    stream.fence = fence;
    stream.tail = "";
    stream.unjudged = 0;
  };
  const text = (stream: Stream, line: string) => {
    if (stream.fence && endsContainer(line, stream.fence))
      fenceChanged(stream, null);
    judged(stream, line);
  };
  return {
    feed(kind, delta) {
      let stream = streams.get(kind);
      if (!stream) {
        stream = { tail: "", unjudged: 0, fence: null, line: "" };
        streams.set(kind, stream);
      }
      let from = 0;
      while (from < delta.length) {
        let end = from;
        while (end < delta.length && delta[end] !== "\n" && delta[end] !== "\r")
          end++;
        const piece = delta.slice(from, end);
        const ended = end < delta.length;
        from = end + 1;
        if (stream.line === null) judged(stream, piece);
        else {
          let line = stream.line + piece;
          if (line.length > FENCE_LINE_MAX && CLOSER_SHAPE.test(line))
            line = line.trimEnd();
          if (line.length > FENCE_LINE_MAX || !FENCE_PREFIX.test(line)) {
            text(stream, line);
            stream.line = null;
          } else stream.line = line;
        }
        if (!ended) break;
        const line = stream.line;
        stream.line = "";
        if (line === null) {
          judged(stream, "\n");
          continue;
        }
        if (stream.fence && closes(line, stream.fence)) {
          fenceChanged(stream, null);
          continue;
        }
        if (stream.fence && endsContainer(line, stream.fence))
          fenceChanged(stream, null);
        const opened = stream.fence ? null : opens(line);
        if (opened) fenceChanged(stream, opened);
        else judged(stream, `${line}\n`);
      }
      if (stream.fence || stream.unjudged < JUDGE_EVERY_CHARS) return false;
      stream.unjudged = 0;
      return isRepetitionLoop(stream.tail);
    },
    reset() {
      streams.clear();
    },
  };
}
