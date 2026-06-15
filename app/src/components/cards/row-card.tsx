/**
 * RowCard — the single inline card shape used across the chat feed and
 * integration surfaces. Modeled on the integration / Composio sign-in card:
 * a small logo on the LEFT, a title + (optional) description in the middle,
 * and a single action area on the RIGHT, on a grey (`bg-secondary`) slab.
 *
 * One component, two render shapes:
 *  - block (default): a full-width `<div>` row — feed cards (reconnect,
 *    rate-limit, provider-switch dialog body).
 *  - `inline`: a `<span>`-based row that drops into assistant markdown prose
 *    without breaking the flow — the Composio cards the agent posts
 *    mid-message.
 *
 * The action slot is a free `ReactNode` so a card can mount one button, two,
 * or a status pill. Use `RowCardButton` for the standard pill button — its
 * `icon` is optional, which is the whole point: most cards are text-only
 * (the issue wants no key/retry glyphs in the button), but the Composio
 * cards still pass their trailing "open in browser" link icon.
 */

import type { ReactNode } from "react";

interface RowCardProps {
  /** Left media — a `ProviderGlyph`, app logo `<img>`, favicon, or icon. */
  media: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** Right-side slot: a `RowCardButton`, two of them, or a status pill. */
  action?: ReactNode;
  /** Truncate title + description to one line (integration/Composio look). */
  truncate?: boolean;
  /** Render as an inline `<span>` row for embedding in chat prose. */
  inline?: boolean;
}

export function RowCard({
  media,
  title,
  description,
  action,
  truncate = false,
  inline = false,
}: RowCardProps) {
  const Wrapper = inline ? "span" : "div";
  const rowClass = `${inline ? "inline-flex" : "flex w-full"} items-center gap-3 rounded-xl bg-secondary px-3 py-2.5 min-w-0`;
  const descClass = `text-[11px] text-muted-foreground${truncate ? " truncate" : ""}`;

  const row = (
    <Wrapper className={rowClass}>
      <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-background text-foreground">
        {media}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={`text-[13px] font-medium text-foreground${truncate ? " truncate" : ""}`}
        >
          {title}
        </span>
        {description != null && <span className={descClass}>{description}</span>}
      </span>
      {action != null && <span className="flex shrink-0 items-center gap-2">{action}</span>}
    </Wrapper>
  );

  if (inline) {
    return (
      <span className="not-prose my-1 inline-flex max-w-full align-middle">{row}</span>
    );
  }
  return row;
}
