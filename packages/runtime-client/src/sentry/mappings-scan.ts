export interface GeneratedPosition {
  line: number;
  column: number;
}

export interface OriginalPosition {
  file: string;
  line: number;
  column: number;
}

const SEMICOLON = 59;
const COMMA = 44;

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
  } catch {}
  return found;
}
