const OPENING_CHARS = new Set(["(", "[", "{", "<", '"', "'", "“", "‘"]);

const WORD_CHAR = /[\p{L}\p{N}\p{M}_]/u;

export function normalizeMentionText(s: string): string {
  return s.normalize("NFC");
}

export function mentionSpanKey(s: string): string {
  return normalizeMentionText(s).toLowerCase();
}

export function mentionKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function isMentionStart(text: string, index: number): boolean {
  if (text[index] !== "@") return false;
  if (index === 0) return true;
  const prev = text[index - 1] as string;
  return /\s/.test(prev) || OPENING_CHARS.has(prev);
}

export function extendsName(char: string | undefined): boolean {
  return char !== undefined && WORD_CHAR.test(char);
}
