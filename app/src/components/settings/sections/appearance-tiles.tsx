import type { PaletteId, ResolvedMode } from "@houston/sdk/appearance";
import { cn } from "@houston-ai/core";
import type { KeyboardEvent } from "react";
import {
  arrowStep,
  type PaletteEntry,
  palettesForMode,
  wrapIndex,
} from "./appearance-model";

interface PaletteTileGroupProps {
  mode: ResolvedMode;
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
    event.currentTarget
      .querySelector<HTMLButtonElement>(`[data-palette-tile="${next.id}"]`)
      ?.focus();
  };

  return (
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
      tabIndex={selected ? 0 : -1}
      data-palette-tile={palette.id}
      onClick={onSelect}
      className="group flex flex-col items-center gap-1.5 outline-none"
    >
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
