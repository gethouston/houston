import { closeSync, openSync, readSync } from "node:fs";
import { StringDecoder } from "node:string_decoder";

/** Read like pi, without its newline repair of the archived file. */
export function* sessionLogLines(file: string) {
  const descriptor = openSync(file, "r");
  try {
    const decoder = new StringDecoder("utf8");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let pending = "";
    let offset = 0;
    for (;;) {
      const bytes = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytes === 0) break;
      pending += decoder.write(buffer.subarray(0, bytes));
      let start = 0;
      let newline = pending.indexOf("\n");
      while (newline !== -1) {
        const line = pending.slice(start, newline);
        yield { line, offset };
        offset += Buffer.byteLength(line) + 1;
        start = newline + 1;
        newline = pending.indexOf("\n", start);
      }
      pending = pending.slice(start);
    }
    pending += decoder.end();
    if (pending) yield { line: pending, offset };
  } finally {
    closeSync(descriptor);
  }
}
