/**
 * How a markdown `<a>` rendered by Streamdown should behave in chat.
 *
 * - `plain`    — no href, nothing to open. Render inert text.
 * - `autolink` — the visible text IS a URL: a bare URL GFM auto-linked
 *                (`https://example.com`), or a link whose label is the URL
 *                itself (`[https://…](https://…)`). Render it inline AND
 *                clickable so it opens in the system browser (issue #358).
 *                Never a button pill — a pill clips a long URL into an
 *                unreadable black bar.
 * - `labeled`  — the link has descriptive text distinct from the URL
 *                (`[Open report](https://…)`). Render the labeled button.
 */
export type MarkdownLinkKind = "plain" | "autolink" | "labeled";

/**
 * Flatten an `<a>`'s rendered children into their visible text. Streamdown
 * hands children as a string, an array of nodes, or wrapper elements (e.g.
 * animation spans while streaming) — a strict `children === href` check
 * misses all but the first shape. Duck-typed on `props.children` instead of
 * importing React so this module stays unit-testable without a DOM. Returns
 * null when any child isn't text-like (e.g. an image link).
 */
export function markdownLinkText(children: unknown): string | null {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) {
    let text = "";
    for (const child of children) {
      const part = markdownLinkText(child);
      if (part === null) return null;
      text += part;
    }
    return text;
  }
  if (
    typeof children === "object" &&
    children !== null &&
    "props" in children
  ) {
    const props = (children as { props: unknown }).props;
    if (typeof props === "object" && props !== null && "children" in props) {
      return markdownLinkText((props as { children: unknown }).children);
    }
  }
  return null;
}

/** Visible text that is itself a web URL, e.g. a Drive share link. */
const URL_TEXT = /^https?:\/\/\S+$/;

/**
 * Classify a markdown link by its href and rendered children.
 *
 * Autolink when the visible text equals the href (bare auto-linked URLs,
 * including relative paths like `perfil.md`), when the text is a web URL in
 * its own right (the label being a URL is exactly the case where a pill
 * renders broken), or when it equals the decoded href (micromark
 * percent-encodes hrefs it normalizes).
 */
export function classifyMarkdownLink(
  href: string | null | undefined,
  children: unknown,
): MarkdownLinkKind {
  if (!href) return "plain";
  const text = markdownLinkText(children);
  if (text === null) return "labeled";
  if (text === href) return "autolink";
  if (URL_TEXT.test(text)) return "autolink";
  try {
    if (decodeURI(href) === text) return "autolink";
  } catch {
    // Malformed percent-encoding in the href — treat as labeled.
  }
  return "labeled";
}
