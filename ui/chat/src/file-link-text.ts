const ENDS_IN_EXTENSION = /\.[A-Za-z0-9]{1,10}$/;

const UNPARSED_LINK = /\[([^\][\n]+)\]\(([^()\n]+)\)/g;

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

export type FileLinkProps = (
  destination: string,
) => Record<string, unknown> | null;

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
