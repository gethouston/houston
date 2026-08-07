/**
 * Repair the file link CommonMark refuses to parse (PRODUCT-1231).
 *
 * A markdown destination may not contain unescaped spaces, so
 * `[informe trimestral](informes/Q3 reporte.pdf)` is NOT a link — it is
 * literal text, and that is exactly how it reached the reader: raw brackets
 * and parens in the middle of a sentence. Agents write it constantly, because
 * a file whose name has a space in it is the normal case and `<...>` is not
 * something a model reliably remembers.
 *
 * The repair happens on TEXT NODES rather than on the markdown source, which
 * is what makes it safe: by the time rehype runs, a fenced block or an inline
 * code span is its own `code`/`pre` element, so a `[x](y z.md)` written inside
 * one is never a text node we walk. The same reason `mention-rehype.ts` works
 * on text nodes.
 *
 * Matching is deliberately narrow — this rewrites the reader's prose, so a
 * false positive is worse than a miss:
 *
 *   - The destination must survive {@link markdownFilePath} (no scheme, no
 *     protocol-relative host, no bare anchor).
 *   - It must END IN A FILE EXTENSION. This is the load-bearing guard: it is
 *     what keeps ordinary prose like "see [the note](a longer aside)" intact.
 *   - Neither half may span a line, and the label may not nest brackets.
 */

/** A destination that actually names a file: `…/Q3 reporte.pdf`, `plan.md`. */
const ENDS_IN_EXTENSION = /\.[A-Za-z0-9]{1,10}$/;

/**
 * `[label](destination)` as it survives in text. Label rejects brackets and
 * newlines; destination rejects parens and newlines, so the match cannot run
 * past its own closing paren.
 */
const UNPARSED_LINK = /\[([^\][\n]+)\]\(([^()\n]+)\)/g;

/** The slice of hast this transform mints. Structural so `ui/chat` needs no
 *  `@types/hast` dependency. */
interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

/** Builds the `<a>` properties for a destination, or null when it is not a
 *  workspace file. Injected so this module never imports the rehype pass that
 *  calls it. */
export type FileLinkProps = (
  destination: string,
) => Record<string, unknown> | null;

/**
 * Replacement nodes for a text value carrying one or more unparsed file links,
 * or null when it carries none (the overwhelmingly common case, so this bails
 * on the cheap regex test before allocating anything).
 */
export function splitFileLinks(
  value: string,
  fileLinkProps: FileLinkProps,
): HastNode[] | null {
  UNPARSED_LINK.lastIndex = 0;
  if (!UNPARSED_LINK.test(value)) return null;
  UNPARSED_LINK.lastIndex = 0;

  const out: HastNode[] = [];
  let cursor = 0;
  let matched = false;

  for (const match of value.matchAll(UNPARSED_LINK)) {
    const [whole, label, destination] = match;
    const at = match.index ?? 0;
    const dest = destination.trim();
    const properties = ENDS_IN_EXTENSION.test(dest)
      ? fileLinkProps(dest)
      : null;
    // Not a file reference — leave the text exactly as the agent wrote it.
    if (!properties) continue;

    matched = true;
    if (at > cursor) out.push({ type: "text", value: value.slice(cursor, at) });
    out.push({
      type: "element",
      tagName: "a",
      properties,
      children: [{ type: "text", value: label }],
    });
    cursor = at + whole.length;
  }

  if (!matched) return null;
  if (cursor < value.length) {
    out.push({ type: "text", value: value.slice(cursor) });
  }
  return out;
}
