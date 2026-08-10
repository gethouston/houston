import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { headerLozengeClasses, headerLozengeTrack } from "./header-lozenge";

/**
 * The way back from a DRILLED page header — a level a section opened INSIDE a
 * top-level screen, wearing the screen's own lozenge grammar:
 *
 *     (‹ 🏢 Admin) (Analytics)(Usage)(Time worked)
 *
 * Three rules make an inner level legible, and every drilled header follows
 * them:
 *
 * - **The chip precedes the cluster and never collapses into a menu** — the
 *   way back must stay visible at every width.
 * - **The chip wears the DESTINATION's glyph** — the same mark the top-level
 *   identity lozenge wears, so "where this goes" is recognizable at a glance,
 *   not just readable.
 * - **The drilled cluster's identity is text-only.** Only a top-level
 *   identity lozenge carries a glyph, so the bare words plus this chip are
 *   how an inner page reads as inner.
 *
 * A quiet unpainted lozenge on its own track: a door, not a place, so it
 * never takes the active fill.
 */
export function PageHeaderBackChip({
  label,
  icon,
  onClick,
  dataAttrs,
}: {
  /** The place the chip returns to, named as its rail row names it. */
  label: string;
  /** The destination's glyph — what its top-level identity lozenge wears. */
  icon: ReactNode;
  onClick: () => void;
  dataAttrs?: Record<string, string>;
}) {
  return (
    <span className={headerLozengeTrack("shrink-0")}>
      <button
        type="button"
        {...dataAttrs}
        onClick={onClick}
        className={headerLozengeClasses(false)}
      >
        <ChevronLeft aria-hidden className="-ml-0.5 size-4 shrink-0" />
        {icon}
        <span className="min-w-0 truncate">{label}</span>
      </button>
    </span>
  );
}
