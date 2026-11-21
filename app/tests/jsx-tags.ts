export interface JsxTag {
  text: string;
  line: number;
}

function openingTagEnd(source: string, start: number): number {
  let depth = 0;
  let quote = "";
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (char === "\\") i += 1;
      else if (char === quote) quote = "";
    } else if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    else if (char === ">" && depth === 0) return i + 1;
  }
  return source.length;
}

export function openingTags(source: string, opening: RegExp): JsxTag[] {
  const tags: JsxTag[] = [];
  const scan = new RegExp(opening, "g");
  for (let match = scan.exec(source); match; match = scan.exec(source)) {
    const end = openingTagEnd(source, match.index);
    tags.push({
      text: source.slice(match.index, end),
      line: source.slice(0, match.index).split("\n").length,
    });
    scan.lastIndex = end;
  }
  return tags;
}
