import { cn, HoustonHelmet } from "@houston-ai/core";
import type { ReactNode } from "react";
import { Shimmer } from "./ai-elements/shimmer";

export interface ChatStatusLineProps {
  /** The status text shown next to the leading glyph. */
  label: string;
  /**
   * When true the label shimmers to signal an ongoing / pending state —
   * the same treatment the "Thinking..." line uses. Leave it off for a
   * settled, static status.
   */
  active?: boolean;
  /** Helmet glyph size in px. Defaults to 13 to match the Mission log line. */
  iconSize?: number;
  /** Leading glyph. Defaults to the Houston helmet; pass a node (e.g. a
   *  per-tool icon) to stand in for it. */
  icon?: ReactNode;
  /** Extra classes for the root span (e.g. the muted text color the
   *  consumer wants). Color is inherited so callers control it. */
  className?: string;
}

/**
 * The little glyph + muted-label status line (helmet by default). It is the
 * visual identity of the chat's "Mission log" / "Thinking..." row, lifted out
 * of `ChatProcessBlock` so the exact same line can stand alone elsewhere (e.g.
 * a "Waiting for you to connect" prompt on a Composio card) or carry a per-tool
 * icon in place of the helmet, without duplicating the glyph + shimmer wiring.
 *
 * Renders as an inline-level element (spans only) so it stays valid nested
 * inside markdown prose. Text color is inherited from the parent; pass it via
 * `className` or set it on an ancestor.
 */
export function ChatStatusLine({
  label,
  active,
  iconSize = 13,
  icon,
  className,
}: ChatStatusLineProps) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1.5 text-xs",
        className,
      )}
    >
      {icon ?? <HoustonHelmet color="currentColor" size={iconSize} />}
      <span className="min-w-0 truncate text-left">
        {active ? <Shimmer duration={1}>{label}</Shimmer> : label}
      </span>
    </span>
  );
}
