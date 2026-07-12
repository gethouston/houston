/**
 * RowCard — the single inline card shape used across the chat feed and
 * integration surfaces. Modeled on the integration / Composio sign-in card:
 * a small logo on the LEFT, a title + (optional) description in the middle,
 * and a single action area on the RIGHT, on a grey (`bg-chip`) slab.
 *
 * One component, two render shapes:
 *  - block (default): a full-width `<div>` row — feed cards (reconnect,
 *    rate-limit, provider-switch dialog body).
 *  - `inline`: a `<span>`-based row that drops into assistant markdown prose
 *    without breaking the flow — the Composio cards the agent posts
 *    mid-message.
 *
 * `size`:
 *  - `"sm"` (default) — feed/integration density (13px title, 11px body).
 *  - `"md"` — a roomier heading (15px title, 13px body) for the
 *    provider-switch dialog, which reads as a modal heading rather than a
 *    feed row.
 *
 * Body text is `text-ink/70` (not `text-ink-muted`): the muted
 * token is too low-contrast on the grey slab to read comfortably.
 *
 * The action slot is a free `ReactNode` so a card can mount one button, two,
 * or a status pill. Use `RowCardButton` for the standard pill button.
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
  /** Text density — `md` for the modal dialog heading. */
  size?: "sm" | "md";
  /**
   * The surface this card sits ON, which sets the slab tone so it always reads
   * as raised:
   *  - `"base"` (default): on a `bg-input` surface → grey `bg-chip`
   *    slab (the feed / inline-prose look).
   *  - `"secondary"`: on a `bg-chip` surface (e.g. inside the interaction
   *    card) → white `bg-input` slab with a hairline border, so it matches
   *    the raised chip hierarchy of the sibling option rows and input.
   */
  surface?: "base" | "secondary";
}

export function RowCard({
  media,
  title,
  description,
  action,
  truncate = false,
  inline = false,
  size = "sm",
  surface = "base",
}: RowCardProps) {
  const Wrapper = inline ? "span" : "div";
  // Invert against the parent surface so the slab (and its media well) never go
  // tone-on-tone: on `bg-chip` the slab flips to `bg-input` (raised
  // white chip, hairline border matching the option rows) and the media well
  // flips to `bg-chip`.
  const raised = surface === "secondary";
  const slabTone = raised
    ? "rounded-2xl border border-line/50 bg-input"
    : "rounded-xl bg-chip";
  const mediaTone = raised ? "bg-chip" : "bg-input";
  const rowClass = `${inline ? "inline-flex" : "flex w-full"} items-center gap-3 ${slabTone} px-3 py-2.5 min-w-0`;
  const titleSize =
    size === "md" ? "text-[15px] font-semibold" : "text-[13px] font-medium";
  const bodySize = size === "md" ? "text-[13px]" : "text-[11px]";
  const titleClass = `text-ink ${titleSize}${truncate ? " truncate" : ""}`;
  const descClass = `text-ink/70 ${bodySize}${truncate ? " truncate" : ""}`;

  const row = (
    <Wrapper className={rowClass}>
      <span
        className={`flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg ${mediaTone} text-ink`}
      >
        {media}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={titleClass}>{title}</span>
        {description != null && (
          <span className={descClass}>{description}</span>
        )}
      </span>
      {action != null && (
        <span className="flex shrink-0 items-center gap-2">{action}</span>
      )}
    </Wrapper>
  );

  if (inline) {
    return (
      <span className="not-prose my-1 inline-flex max-w-full align-middle">
        {row}
      </span>
    );
  }
  return row;
}
