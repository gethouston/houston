import type { MobileMoreRow } from "./mobile-more-items";

const ROW_CLASSES =
  "flex min-h-12 w-full items-center gap-3 px-4 text-base text-ink transition-colors active:scale-[0.98] hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset";

/**
 * One destination in the phone's More menu. It spreads the rail row's own
 * `dataAttrs`, so the guided setup's anchors resolve to THIS element on the
 * phone exactly as they resolve to the rail row on the desktop — one
 * vocabulary, two renderings.
 */
export function MobileMoreRowButton({ row }: { row: MobileMoreRow }) {
  return (
    <button
      type="button"
      onClick={row.onClick}
      className={ROW_CLASSES}
      {...row.dataAttrs}
    >
      <span className="flex size-5 shrink-0 items-center justify-center text-ink-muted">
        {row.icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-left">{row.label}</span>
      {row.trailing}
    </button>
  );
}

/** A footer action: same row anatomy, no glyph column, because neither of the
 *  two points at a screen. */
export function MobileMoreActionRow({
  label,
  onSelect,
}: {
  label: string;
  onSelect: () => void;
}) {
  return (
    <button type="button" onClick={onSelect} className={ROW_CLASSES}>
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
    </button>
  );
}

/** The band naming a labelled run. */
export function MobileMoreBand({ label }: { label: string }) {
  return (
    <p className="px-4 pt-3 pb-1 font-weight-510 text-ink-muted text-xs">
      {label}
    </p>
  );
}
