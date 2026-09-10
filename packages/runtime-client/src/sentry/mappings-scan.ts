/**
 * The per-lookup walk over a v3 `mappings` string (see source-map.ts for why
 * the map is not decoded up front). Reads segments one VLQ at a time with a
 * scalar cursor: no array per segment, nothing retained between calls.
 */

/** A generated-code location as V8 reports it, minus one on the column. */
export interface GeneratedPosition {
  /** 1-based. */
  line: number;
  /** 0-based. */
  column: number;
}

export interface OriginalPosition {
  /** Absolute path of the original source file. */
  file: string;
  /** 1-based. */
  line: number;
  /** 0-based. */
  column: number;
}

const SEMICOLON = 59;
const COMMA = 44;

/** Base64 digit → value, -1 for anything that is not a VLQ character. */
const VLQ_DIGIT = (() => {
  const table = new Int8Array(128).fill(-1);
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  for (let i = 0; i < alphabet.length; i++) {
    table[alphabet.charCodeAt(i)] = i;
  }
  return table;
})();

class Cursor {
  pos = 0;
  constructor(private readonly encoded: string) {}

  get done(): boolean {
    return this.pos >= this.encoded.length;
  }

  peek(): number {
    return this.encoded.charCodeAt(this.pos);
  }

  atSegmentEnd(): boolean {
    if (this.done) return true;
    const char = this.peek();
    return char === COMMA || char === SEMICOLON;
  }

  readVlq(): number {
    let value = 0;
    let shift = 0;
    let digit: number;
    do {
      if (this.done || shift > 30) throw new RangeError("malformed VLQ");
      digit = VLQ_DIGIT[this.encoded.charCodeAt(this.pos++)] ?? -1;
      if (digit < 0) throw new RangeError("malformed VLQ");
      value += (digit & 31) << shift;
      shift += 5;
    } while (digit & 32);
    return value & 1 ? -(value >>> 1) : value >>> 1;
  }
}

function compareNeedles(
  needles: readonly GeneratedPosition[],
  a: number,
  b: number,
): number {
  const x = needles[a] as GeneratedPosition;
  const y = needles[b] as GeneratedPosition;
  return x.line - y.line || x.column - y.column;
}

/**
 * Original position for each needle, or undefined where the map has no
 * segment at or before it. Same rule as Node's own `SourceMap.findOrigin`
 * (what `--enable-source-maps` applied to stack traces): the greatest segment
 * at or before the needle, in map order across lines, with the needle's
 * distance from that segment carried over. For unminified output that lands
 * on the exact token (segments start at statements; V8 reports the `new`
 * inside one); a needle on a line with no segments of its own inherits the
 * previous line's source and an offset. One scan serves the whole batch, so
 * an event's frames cost one pass however many there are. A malformed
 * `mappings` string ends the scan early and leaves the rest unmapped.
 */
export function scanMappings(
  encoded: string,
  sources: readonly (string | null)[],
  needles: readonly GeneratedPosition[],
): (OriginalPosition | undefined)[] {
  const found: (OriginalPosition | undefined)[] = new Array(
    needles.length,
  ).fill(undefined);
  const order = needles
    .map((_, index) => index)
    .sort((a, b) => compareNeedles(needles, a, b));
  const cursor = new Cursor(encoded);
  let line = 1;
  let next = 0;
  let source = 0;
  let sourceLine = 0;
  let sourceColumn = 0;
  // The last segment with a source, as scalars: no per-segment allocation.
  let lastGeneratedLine = 0;
  let lastGeneratedColumn = 0;
  let lastSource = -1;
  let lastSourceLine = 0;
  let lastSourceColumn = 0;
  const resolve = (index: number): void => {
    const file = lastSource < 0 ? null : sources[lastSource];
    if (!file) return;
    const needle = needles[index] as GeneratedPosition;
    found[index] = {
      file,
      line: lastSourceLine + 1 + (needle.line - lastGeneratedLine),
      column: Math.max(
        0,
        lastSourceColumn + (needle.column - lastGeneratedColumn),
      ),
    };
  };
  try {
    while (!cursor.done && next < order.length) {
      let generated = 0;
      while (!cursor.done) {
        const char = cursor.peek();
        if (char === SEMICOLON) {
          cursor.pos++;
          break;
        }
        if (char === COMMA) {
          cursor.pos++;
          continue;
        }
        generated += cursor.readVlq();
        if (cursor.atSegmentEnd()) continue;
        source += cursor.readVlq();
        sourceLine += cursor.readVlq();
        sourceColumn += cursor.readVlq();
        if (!cursor.atSegmentEnd()) cursor.readVlq();
        // Every needle before this segment resolves against the previous.
        while (next < order.length) {
          const needle = needles[order[next] as number] as GeneratedPosition;
          if (needle.line > line) break;
          if (needle.line === line && needle.column >= generated) break;
          resolve(order[next] as number);
          next++;
        }
        lastGeneratedLine = line;
        lastGeneratedColumn = generated;
        lastSource = source;
        lastSourceLine = sourceLine;
        lastSourceColumn = sourceColumn;
      }
      line++;
    }
    for (; next < order.length; next++) resolve(order[next] as number);
  } catch {
    // Malformed VLQ: whatever was resolved before it stands.
  }
  return found;
}
