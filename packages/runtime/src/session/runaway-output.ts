import {
  CLOSER_SHAPE,
  closes,
  endsContainer,
  FENCE_LINE_MAX,
  FENCE_PREFIX,
  type Fence,
  opens,
} from "./markdown-fence";

/**
 * Spots a model stuck in a repetition loop while it streams. A degenerate
 * generation repeats a short unit ("SymbolSymbol…", "@\t@\t…", " 묶 묶…") until
 * the provider's output limit, and some models allow 500k output tokens: on
 * staging (RL2, 2026-10-03) four such replies ran 112 to 217 s and 19k to 28k
 * tokens each, holding a sandbox the whole time.
 *
 * The test is how many distinct 4-character sequences the last
 * `LOOP_WINDOW_CHARS` of a text or thinking stream holds. A loop of a unit up
 * to a few dozen characters holds at most a few dozen; the four staging loops
 * measured 2 to 56, and each was caught within the reply's first 6.4k
 * characters, 4 to 48 s into replies that ran 112 to 217 s, while none of the
 * other 255 replies of the same run tripped. Real prose, code, tables and JSON hold
 * hundreds: the least varied 4 KiB window across the Houston and cloud repos
 * (3,806 files, 40 MB) held 278. Tool-call input and code blocks are never
 * judged, so a file the model writes, or ASCII art it was asked for, may
 * repeat itself freely.
 */

/** Trailing characters judged together. */
export const LOOP_WINDOW_CHARS = 4096;
/** A window with this many distinct 4-character sequences or fewer is a loop. */
export const LOOP_MAX_DISTINCT = 64;
/** New characters between two judgements: a judgement walks the whole window. */
const JUDGE_EVERY_CHARS = 512;

export type StreamedKind = "text" | "thinking";

/** Whether `window` (a full one) is a short unit repeating. */
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
  /** Feed one streamed delta; true once its stream is a repetition loop. */
  feed(kind: StreamedKind, delta: string): boolean;
  /** Forget both streams (a new model response begins). */
  reset(): void;
}

/**
 * Text inside a markdown code block is never judged (markdown-fence.ts):
 * output a person asked for that repeats by design (ASCII art, a zero-filled
 * array, rows of one CSV line) belongs in one, while the staging loops all
 * ran in plain prose.
 */
interface Stream {
  /** The judged text since the last fence, at most a window of it. */
  tail: string;
  unjudged: number;
  fence: Fence | null;
  /**
   * The current line while it may still be a fence line: held back from
   * judgement until the line ends or proves to be text.
   */
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
  /** The held line proved to be text: judge it, unless still in a fence. */
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
        // CR, LF and CRLF all end a line; a CRLF split across deltas only
        // adds an empty line, which is never a fence.
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
