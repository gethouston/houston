export function estimateTokens(text: string): number {
  let tokens = 0;
  let wordStart = 0;
  for (let i = 0; i <= text.length; i++) {
    const code = i < text.length ? text.charCodeAt(i) : SPACE;
    if (!isWhitespace(code)) continue;
    tokens += wordTokens(text, wordStart, i);
    if (i < text.length) tokens += charTokens(code);
    wordStart = i + 1;
  }
  return Math.ceil(tokens);
}

const SPACE = 0x20;

const OPAQUE_MIN_LENGTH = 16;

const OPAQUE_TOKENS_PER_CHAR = 0.75;

function wordTokens(text: string, start: number, end: number): number {
  if (end - start >= OPAQUE_MIN_LENGTH && isOpaque(text, start, end))
    return (end - start) * OPAQUE_TOKENS_PER_CHAR;
  let tokens = 0;
  for (let i = start; i < end; i++) tokens += charTokens(text.charCodeAt(i));
  return tokens;
}

function isOpaque(text: string, start: number, end: number): boolean {
  let lower = false;
  let upper = false;
  let digit = false;
  let upperAfterFirst = false;
  for (let i = start; i < end; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0x80) return false;
    if (code >= 0x61 && code <= 0x7a) lower = true;
    else if (code >= 0x30 && code <= 0x39) digit = true;
    else if (code >= 0x41 && code <= 0x5a) {
      upper = true;
      if (i > start) upperAfterFirst = true;
    }
  }
  return (lower && digit) || (upper && digit) || (lower && upperAfterFirst);
}

function isWhitespace(code: number): boolean {
  return code === SPACE || code === 0x0a || code === 0x09 || code === 0x0d;
}

function charTokens(code: number): number {
  if (code >= 0x80) return 1;
  const letter =
    (code >= 0x61 && code <= 0x7a) || (code >= 0x41 && code <= 0x5a);
  return letter || code === SPACE ? 0.25 : 0.5;
}
