import {
  cn,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@houston-ai/core";
import type { ReactElement } from "react";
import { SidebarGroupGlyph } from "./sidebar-group-glyphs";
import type { SidebarGroupIdentity } from "./sidebar-group-identity-model";

export type {
  SidebarGroupGlyphChoice,
  SidebarGroupIdentity,
  SidebarGroupIdentityLabels,
  SidebarGroupSwatch,
} from "./sidebar-group-identity-model";

/** A cell in the glyph grid: same 28px box as a rail row's affordance. */
const CELL =
  "flex size-7 items-center justify-center rounded-md transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

/** A caption over a run. Quiet, sentence case, never uppercase. */
const CAPTION = "px-1 pb-1 text-xs text-ink-muted";

/**
 * The "change icon & color" picker, as a SUBMENU of a block's "..." menu.
 *
 * A `DropdownMenuSub` and not a dialog, because this is the same gesture the
 * rail already teaches for an agent's colour
 * (`app/src/components/shell/agent-sidebar-color-menu.tsx`): open the row's
 * "...", slide into a panel, click a swatch, done. A modal for a two-click
 * choice would be a second vocabulary for the same act, and the one thing a
 * rail must not do is answer the same question two ways.
 *
 * Two things inside it are deliberate:
 *
 * - **The grid wears the chosen colour.** Picking a mark and picking a tint are
 *   one decision, so the grid is tinted with the selected swatch's value and
 *   every glyph previews the pair you are about to get. Nothing about a group's
 *   colour is baked into the glyph paths — the tint is inherited, exactly as it
 *   is on the rail row itself (`sidebar-paint.ts`, invariant 3).
 * - **"Default" clears BOTH and is only offered when there is something to
 *   clear.** A reset that resets nothing is a dead entry, and clearing one half
 *   would leave a group wearing a colour with no mark to put it on.
 *
 * Props-only and i18n-agnostic per the `ui/` boundary: the glyph names, the
 * palette and every word arrive from the host.
 */
export function SidebarGroupIdentityMenu({
  identity,
}: {
  identity: SidebarGroupIdentity;
}): ReactElement {
  const { icon, colorId, glyphs, colors, labels, onChange } = identity;
  const tint = colors.find((c) => c.id === colorId)?.value;
  const chosen = icon !== undefined || colorId !== undefined;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>{labels.trigger}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-auto min-w-0 p-2">
        {/* biome-ignore lint/a11y/useSemanticElements: a <fieldset> announces a
            form field set and brings its own intrinsic sizing; this is a run of
            buttons inside a menu popover, which is what role="group" names. */}
        <div role="group" aria-label={labels.icons}>
          <p className={CAPTION}>{labels.icons}</p>
          {/* The colour rides on the grid, not on each cell: one inherited ink
              for the whole preview, so an unpicked mark and a picked one are
              the same object in two states. */}
          <div
            // Eight columns, because the set is 56 marks ordered in themed runs
            // of eight: any other width cuts the runs mid-theme and leaves a
            // ragged last row. Seven full rows of 28px cells stand 210px tall,
            // which a submenu carries without a scroller of its own.
            className="grid grid-cols-8 gap-0.5"
            style={tint ? { color: tint } : undefined}
          >
            {glyphs.map((glyph) => (
              <DropdownMenuItem
                key={glyph.name}
                asChild
                onSelect={(event) => {
                  // Applying is not LEAVING: the pair is picked in two clicks
                  // and closing after the first would hide the swatches behind
                  // a second trip through the menu.
                  event.preventDefault();
                  onChange({ icon: glyph.name });
                }}
              >
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={glyph.name === icon}
                  aria-label={glyph.label}
                  title={glyph.label}
                  className={cn(
                    CELL,
                    glyph.name === icon
                      ? "bg-sidebar-active"
                      : "hover:bg-sidebar-hover",
                  )}
                >
                  {/* `text-current` so the item's own muted-svg rule cannot
                      overpaint the tint the grid is previewing. */}
                  <SidebarGroupGlyph
                    name={glyph.name}
                    className="size-4 text-current"
                  />
                </button>
              </DropdownMenuItem>
            ))}
          </div>
        </div>

        {/* biome-ignore lint/a11y/useSemanticElements: see above. */}
        <div role="group" aria-label={labels.colors} className="pt-2">
          <p className={CAPTION}>{labels.colors}</p>
          <div className="flex flex-wrap gap-1">
            {colors.map((swatch) => (
              <DropdownMenuItem
                key={swatch.id}
                asChild
                onSelect={(event) => {
                  event.preventDefault();
                  onChange({ colorId: swatch.id });
                }}
              >
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={swatch.id === colorId}
                  aria-label={swatch.label}
                  title={swatch.label}
                  className={cn(CELL, "hover:bg-sidebar-hover")}
                >
                  <span
                    aria-hidden="true"
                    // A raw colour value never reaches a className: the palette is
                    // the host's, so it arrives as data and is painted inline.
                    style={{ backgroundColor: swatch.value }}
                    className={cn(
                      "size-4 rounded-full",
                      swatch.id === colorId &&
                        "ring-2 ring-ink/40 ring-offset-2 ring-offset-popover",
                    )}
                  />
                </button>
              </DropdownMenuItem>
            ))}
          </div>
        </div>

        {chosen && (
          <>
            <DropdownMenuSeparator className="-mx-2" />
            <DropdownMenuItem
              onSelect={() => onChange({ icon: null, colorId: null })}
            >
              {labels.none}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
