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
 * The tiles one mode picks its palette from: a radio group of miniature scenes,
 * one per shipped palette of that mode.
 *
 * A palette is named by a proper noun ("Nord", "Catppuccin Latte"), so the
 * accessible name and the visible caption are the library's own `name` and never
 * pass through `t()` — a palette is not translated any more than a brand is.
 */

interface PaletteTileGroupProps {
  mode: ResolvedMode;
  /** The id of the section heading that names this group for assistive tech. */
  labelledBy: string;
  selected: PaletteId;
  onSelect: (id: PaletteId) => void;
}

export function PaletteTileGroup({
  mode,
  labelledBy,
  selected,
  onSelect,
}: PaletteTileGroupProps) {
  const items = palettesForMode(mode);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = arrowStep(event.key);
    if (step === null) return;
    event.preventDefault();
    const from = items.findIndex((palette) => palette.id === selected);
    const next = items[wrapIndex(from, step, items.length)];
    onSelect(next.id);
    // A radio group's arrows carry focus WITH the selection (WAI-ARIA), and the
    // roving tabindex has just moved to the newly checked tile, so the one that
    // held focus would otherwise drop it out of the group entirely.
    event.currentTarget
      .querySelector<HTMLButtonElement>(`[data-palette-tile="${next.id}"]`)
      ?.focus();
  };

  return (
    // Three per row on the phone, where a 328px dialog cannot pay for six; the
    // whole mode reads as one row from the desktop breakpoint up.
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      onKeyDown={handleKeyDown}
      className="grid grid-cols-3 gap-3 md:grid-cols-6"
    >
      {items.map((palette) => (
        <PaletteTile
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
 * One palette as the app it paints: the window gutter fills the tile, the screen
 * sits inset on it, and a card row inside the screen carries an accent pill and
 * a line of ink. The scene keeps a 5:3 shape capped at 120×72, so the smallest
 * it ever gets — three to a phone row — still clears a 44px thumb target.
 */
function PaletteTile({
  palette,
  selected,
  onSelect,
}: {
  palette: PaletteEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  const { base, background, ink, accent } = palette.swatch;
  return (
    // biome-ignore lint/a11y/useSemanticElements: a tile is a painted scene of four palette colours, which an <input type="radio"> cannot carry; radio semantics come from role + aria-checked + the roving tabindex the group's arrows walk.
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={palette.name}
      // Roving tabindex: the group is ONE tab stop and the arrows move inside it.
      tabIndex={selected ? 0 : -1}
      data-palette-tile={palette.id}
      onClick={onSelect}
      className="group flex flex-col items-center gap-1.5 outline-none"
    >
      {/* A tile IS a colour sample: every fill below is the palette's own hex,
          read from the token export as DATA and painted inline, so no raw colour
          is ever authored here (DESIGN.md §3.1). The hairline keeps a near-white
          palette visible against the dialog. */}
      <span
        aria-hidden="true"
        style={{ background: base }}
        className={cn(
          "ht-hairline flex aspect-[5/3] w-full max-w-30 flex-col justify-end rounded-lg p-1.5 ring-offset-2 ring-offset-dialog transition-transform duration-200 group-hover:scale-[1.03] group-focus-visible:ring-2 group-focus-visible:ring-focus",
          selected && "ring-2 ring-focus",
        )}
      >
        <span
          style={{ background }}
          className="flex flex-1 items-end rounded-md p-1"
        >
          <span
            style={{ background: base }}
            className="flex w-full items-center gap-1 rounded-sm p-1"
          >
            <span
              style={{ background: accent }}
              className="h-1.5 w-1/4 shrink-0 rounded-full"
            />
            <span
              style={{ background: ink }}
              className="h-0.5 w-1/2 rounded-full"
            />
          </span>
        </span>
      </span>
      <span className="text-center text-sm leading-tight text-ink">
        {palette.name}
      </span>
    </button>
  );
}
