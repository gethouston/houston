import { cn } from "@houston-ai/core";
import type { KeyboardEvent } from "react";
import type { PaletteId, ResolvedMode } from "../../../lib/theme-model";
import {
  arrowStep,
  type PaletteEntry,
  palettesForMode,
  wrapIndex,
} from "./appearance-model";

/**
 * The swatch row one mode picks its palette from: a radio group of colour
 * samples, one per shipped palette of that mode.
 *
 * A palette is named by a proper noun ("Nord", "Catppuccin Latte"), so the
 * accessible name and the tooltip are the library's own `name` and never pass
 * through `t()` — a palette is not translated any more than a brand is.
 */

interface PaletteRowProps {
  mode: ResolvedMode;
  /** Names the group for assistive tech: the row's own title. */
  label: string;
  selected: PaletteId;
  /** True while this mode is NOT the one on screen (see `isRowDimmed`). */
  dimmed: boolean;
  onSelect: (id: PaletteId) => void;
}

export function PaletteRow({
  mode,
  label,
  selected,
  dimmed,
  onSelect,
}: PaletteRowProps) {
  const items = palettesForMode(mode);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = arrowStep(event.key);
    if (step === null) return;
    event.preventDefault();
    const from = items.findIndex((palette) => palette.id === selected);
    const next = items[wrapIndex(from, step, items.length)];
    onSelect(next.id);
    // A radio group's arrows carry focus WITH the selection (WAI-ARIA), and the
    // roving tabindex has just moved to the newly checked swatch, so the one
    // that held focus would otherwise drop it out of the row entirely.
    event.currentTarget
      .querySelector<HTMLButtonElement>(`[data-palette-swatch="${next.id}"]`)
      ?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={handleKeyDown}
      // Wraps on a phone, where six 44px targets outrun a 360px row. Dimmed
      // rather than disabled: the row stays fully interactive.
      className={cn(
        "flex flex-wrap items-center gap-1 md:flex-nowrap",
        dimmed && "opacity-60",
      )}
    >
      {items.map((palette) => (
        <PaletteSwatch
          key={palette.id}
          palette={palette}
          selected={palette.id === selected}
          onSelect={() => onSelect(palette.id)}
        />
      ))}
    </div>
  );
}

/**
 * One palette as a 40px circle split diagonally — the window gutter above the
 * fold, the screen below it, the accent as a dot — inside a 44px target, so the
 * smallest control on the screen is still a comfortable thumb tap.
 */
function PaletteSwatch({
  palette,
  selected,
  onSelect,
}: {
  palette: PaletteEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  const { base, background, accent } = palette.swatch;
  return (
    // biome-ignore lint/a11y/useSemanticElements: a swatch is a painted circle with a diagonal split and an accent dot, which an <input type="radio"> cannot carry; radio semantics come from role + aria-checked + the roving tabindex the row's arrows walk.
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={palette.name}
      title={palette.name}
      // Roving tabindex: the row is ONE tab stop and the arrows move inside it.
      tabIndex={selected ? 0 : -1}
      data-palette-swatch={palette.id}
      onClick={onSelect}
      className="group flex size-11 shrink-0 items-center justify-center rounded-full outline-none"
    >
      {/* A swatch IS a colour sample: these three hexes are the palette's own
          values, read from the token export as DATA and painted inline, so no
          raw colour is ever authored here (DESIGN.md §3.1). The hairline keeps
          a near-white palette visible against the card. */}
      <span
        aria-hidden="true"
        style={{
          backgroundImage: `linear-gradient(135deg, ${base} 50%, ${background} 50%)`,
        }}
        className={cn(
          "ht-hairline flex size-10 items-center justify-center rounded-full ring-offset-2 ring-offset-card transition-transform duration-200 group-hover:scale-105 group-focus-visible:ring-2 group-focus-visible:ring-focus",
          selected && "ring-2 ring-focus",
        )}
      >
        <span
          className="size-2.5 rounded-full"
          style={{ background: accent }}
        />
      </span>
    </button>
  );
}
