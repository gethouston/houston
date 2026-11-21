export function firstJsonValueEnd(text: string): number {
  let i = 0;
  while (i < text.length && isJsonWhitespace(text[i])) i++;
  const open = text[i];
  if (open !== "{" && open !== "[") return -1;
  let depth = 0;
  let inString = false;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

export function escapeControlCharsInStrings(text: string): string | undefined {
  let out = "";
  let last = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!inString) {
      if (ch === '"') inString = true;
      continue;
    }
    if (ch === "\\") i++;
    else if (ch === '"') inString = false;
    else if (text.charCodeAt(i) < 0x20) {
      out += text.slice(last, i) + jsonEscape(text.charCodeAt(i));
      last = i + 1;
    }
  }
  if (last === 0) return undefined;
  return out + text.slice(last);
}

export function escapeStrayQuotesInStrings(text: string): string | undefined {
  let out = "";
  let last = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!inString) {
      if (ch === '"') inString = true;
      continue;
    }
    if (ch === "\\") i++;
    else if (ch === '"') {
      if (closesString(text, i + 1)) inString = false;
      else {
        out += `${text.slice(last, i)}\\"`;
        last = i + 1;
      }
    }
  }
  if (last === 0) return undefined;
  return out + text.slice(last);
}

function closesString(text: string, from: number): boolean {
  let j = from;
  while (j < text.length && isJsonWhitespace(text[j])) j++;
  const next = text[j];
  return (
    next === undefined ||
    next === "," ||
    next === "}" ||
    next === "]" ||
    next === ":"
  );
}

export function salvageLeadingJson(text: string): unknown {
  const end = firstJsonValueEnd(text);
  if (end < 0 || end >= text.length) return undefined;
  if (text.slice(end).trim() === "") return undefined;
  try {
    return JSON.parse(text.slice(0, end)) as unknown;
  } catch {
    return undefined;
  }
}

export function salvageJsonDoc(text: string): unknown {
  const escaped = escapeControlCharsInStrings(text);
  if (escaped !== undefined) {
    try {
      return JSON.parse(escaped) as unknown;
    } catch {}
  }
  const quoted = escapeStrayQuotesInStrings(escaped ?? text);
  if (quoted !== undefined) {
    try {
      return JSON.parse(quoted) as unknown;
    } catch {}
  }
  return salvageLeadingJson(quoted ?? escaped ?? text);
}

function jsonEscape(code: number): string {
  return JSON.stringify(String.fromCharCode(code)).slice(1, -1);
}

function isJsonWhitespace(ch: string | undefined): boolean {
  return ch === " " || ch === "\n" || ch === "\r" || ch === "\t";
}
