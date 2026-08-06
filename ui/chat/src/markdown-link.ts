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
 *                (`[Open report](https://…)`). Renders as the SAME inline
 *                link chip as an autolink, wearing the label instead of the
 *                shortened URL (HOU-1152): every link in a message reads as
 *                one thing. The kind still matters — a labeled link shows its
 *                label verbatim, an autolink shortens its URL.
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
    // A hard break inside a link label (agents hard-wrap long URLs with
    // trailing spaces or a backslash, HOU-1071) renders as a childless
    // <br> element — line-break hints are whitespace, not "not text".
    const type = (children as { type?: unknown }).type;
    if (type === "br") return "\n";
    if (type === "wbr") return "";
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
 * percent-encodes hrefs it normalizes). The URL test also runs on the
 * whitespace-collapsed text: agents hard-wrap long URLs inside a
 * `[label](href)`, and the softbreak flattens into the label as "\n"
 * (HOU-1071) — without collapsing, that label fell into the pill branch
 * and clipped the URL into an unreadable black bar.
 */
export function classifyMarkdownLink(
  href: string | null | undefined,
  children: unknown,
): MarkdownLinkKind {
  if (!href) return "plain";
  const text = markdownLinkText(children);
  if (text === null) return "labeled";
  if (text === href) return "autolink";
  if (URL_TEXT.test(text.replace(/\s+/g, ""))) return "autolink";
  try {
    if (decodeURI(href) === text) return "autolink";
  } catch {
    // Malformed percent-encoding in the href — treat as labeled.
  }
  return "labeled";
}

/**
 * Longest link text rendered verbatim. Anything longer displays as its head
 * plus an ellipsis, Slack-style (HOU-1152) — 64 characters keeps a shortened
 * URL on a single line at the chat bubble's width instead of wrapping a
 * ~100-character share link across three lines of noise.
 */
export const URL_DISPLAY_MAX = 64;

/**
 * Display text for an autolink, Slack-style (HOU-1152): reassemble a URL
 * that markdown broke across lines (the HOU-1071 shape — raw children would
 * show a stray space mid-URL), strip the `https://` scheme, and cap at
 * {@link URL_DISPLAY_MAX} with an ellipsis. Only the visible text changes;
 * the href keeps the full destination (the link chip surfaces it as a hover
 * title). Null when the children should render as-is — non-web autolinks
 * like relative paths, which keep Streamdown's streaming animation wrappers
 * intact.
 */
export function autolinkDisplay(children: unknown): string | null {
  const text = markdownLinkText(children);
  if (text === null) return null;
  const collapsed = text.replace(/\s+/g, "");
  const url = URL_TEXT.test(collapsed) ? collapsed : text;
  const stripped = url.replace(/^https?:\/\//, "");
  const capped =
    stripped.length > URL_DISPLAY_MAX
      ? `${stripped.slice(0, URL_DISPLAY_MAX - 1)}…`
      : stripped;
  return capped === text ? null : capped;
}
