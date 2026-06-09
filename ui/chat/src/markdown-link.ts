/**
 * How a markdown `<a>` rendered by Streamdown should behave in chat.
 *
 * - `plain`    — no href, nothing to open. Render inert text.
 * - `autolink` — the visible text IS the URL. GFM auto-linked a bare URL the
 *                agent dropped into a message (`https://example.com`). Render
 *                it inline AND clickable so it opens in the system browser
 *                (issue #358) instead of sitting there as dead text.
 * - `labeled`  — the link has descriptive text distinct from the URL
 *                (`[Open report](https://…)`). Render the labeled button.
 */
export type MarkdownLinkKind = "plain" | "autolink" | "labeled";

/**
 * Classify a markdown link by its href and rendered children.
 *
 * `children` is a React node in practice, but the only thing that matters for
 * classification is strict equality with the href string — Streamdown emits a
 * bare auto-linked URL as `<a href="X">X</a>`, so `children === href` exactly
 * when the user never gave the link a label. Typed as `unknown` so this helper
 * stays free of React (and therefore unit-testable without a DOM).
 */
export function classifyMarkdownLink(
  href: string | null | undefined,
  children: unknown,
): MarkdownLinkKind {
  if (!href) return "plain";
  return children === href ? "autolink" : "labeled";
}
