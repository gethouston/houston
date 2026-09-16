/**
 * Reading opening JSX tags out of source, for the guards that judge a whole
 * ELEMENT rather than a line — a dialog's width can sit four lines deep in a
 * `cn(...)`, far from the `<DialogContent` that owns it.
 *
 * A real parser would be the honest tool, but the guards run under
 * `node --test` with no build step, and an opening tag is a bracket-balancing
 * problem, not a grammar.
 */

export interface JsxTag {
  /** The opening tag verbatim, `<Name` through its closing `>`. */
  text: string;
  /** 1-based line of the `<`, for the failure message. */
  line: number;
}

/**
 * The index just past the `>` that closes an opening tag.
 *
 * Quotes and `{…}` expressions are skipped, so neither a `>` inside a class
 * string (`[&>svg]:size-4`) nor one inside a multi-line `cn(...)` ends the tag
 * early.
 */
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

/** Every opening tag whose component name `opening` matches. */
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
