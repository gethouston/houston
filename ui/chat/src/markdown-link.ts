export type MarkdownLinkKind = "plain" | "autolink" | "labeled";

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

const URL_TEXT = /^https?:\/\/\S+$/;

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
  } catch {}
  return "labeled";
}

export const URL_DISPLAY_MAX = 64;

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
