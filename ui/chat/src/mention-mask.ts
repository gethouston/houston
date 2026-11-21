const MASK = " ";

export function maskMarkdown(text: string): string {
  const chars = text.split("");
  maskFences(text, chars);
  maskPattern(chars.join(""), chars, /(`+)[\s\S]*?\1/g);
  maskPattern(chars.join(""), chars, /!?\[[^\]\n]*\]\([^)\n]*\)/g);
  return chars.join("");
}

function maskFences(text: string, chars: string[]): void {
  let offset = 0;
  let fence: string | null = null;
  let blockStart = 0;
  for (const line of text.split("\n")) {
    const marker = /^(`{3,}|~{3,})/.exec(line.trimStart())?.[1]?.[0];
    if (fence === null) {
      if (marker) {
        fence = marker;
        blockStart = offset;
      }
    } else if (marker === fence) {
      maskRange(chars, blockStart, offset + line.length);
      fence = null;
    }
    offset += line.length + 1;
  }
  if (fence !== null) maskRange(chars, blockStart, text.length);
}

function maskPattern(source: string, chars: string[], pattern: RegExp): void {
  for (const match of source.matchAll(pattern)) {
    maskRange(chars, match.index, match.index + match[0].length);
  }
}

function maskRange(chars: string[], start: number, end: number): void {
  for (let i = start; i < end; i += 1) {
    if (chars[i] !== "\n") chars[i] = MASK;
  }
}
