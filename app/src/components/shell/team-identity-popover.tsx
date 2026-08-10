import {
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
} from "@houston-ai/core";
import { SidebarGroupGlyph } from "@houston-ai/layout";
import { Users } from "lucide-react";
import { type CSSProperties, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TeamIdentityChoices } from "./team-identity";
import {
  ColorSwatch,
  WASH,
  WASH_HOVER,
  WASH_STRONG,
  WASH_STRONG_HOVER,
} from "./team-identity-swatch";

/**
 * The team's icon-and-colour picker as a POPOVER on the identity button in the
 * create-team dialog: swatch row on top (the AGENT palette, nothing else — a
 * team with no colour simply has no swatch checked), a search field, then the
 * glyph grid, 14 marks per row. The trigger is the preview — it always wears
 * exactly the pair the team would get, starting from the neutral `Users` mark
 * every unthemed team wears.
 *
 * A MODAL popover, deliberately: it opens inside a dialog, whose scroll lock
 * swallows wheel events aimed at anything portaled outside it. `modal` puts
 * the popover inside its own lock, which is what lets the glyph grid scroll.
 *
 * Selecting keeps the popover open: a mark and a tint are a PAIR, picked in
 * two clicks, and the grid previews the chosen tint on every glyph so both
 * clicks stay honest about what they produce.
 */
export function TeamIdentityPopover({
  icon,
  colorId,
  choices,
  onIconChange,
  onColorChange,
}: {
  icon: string | undefined;
  colorId: string | undefined;
  choices: TeamIdentityChoices;
  /** `undefined` = cleared back to the neutral mark (the toggle-off). */
  onIconChange: (name: string | undefined) => void;
  /** `undefined` = cleared back to the default ink (the toggle-off). */
  onColorChange: (id: string | undefined) => void;
}) {
  const { t } = useTranslation(["shell"]);
  const [query, setQuery] = useState("");
  const tint = choices.colors.find((c) => c.id === colorId)?.value;
  const tintVar = tint
    ? ({ "--identity-tint": tint } as CSSProperties)
    : undefined;
  const needle = query.trim().toLocaleLowerCase();
  const shown = needle
    ? choices.glyphs.filter((g) => g.label.toLocaleLowerCase().includes(needle))
    : choices.glyphs;

  return (
    <Popover
      modal
      onOpenChange={(open) => {
        // A reopened picker starts from the whole vocabulary, not last search.
        if (!open) setQuery("");
      }}
    >
      <PopoverTrigger
        type="button"
        aria-label={choices.labels.trigger}
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg outline-none transition-colors duration-200 focus-visible:ring-[3px] focus-visible:ring-focus/50",
          tint
            ? cn(WASH, WASH_STRONG_HOVER)
            : "bg-chip-solid hover:bg-chip-solid-hover",
        )}
        style={tintVar}
      >
        {icon ? (
          <span style={tint ? { color: tint } : undefined}>
            <SidebarGroupGlyph name={icon} className="size-5 text-current" />
          </span>
        ) : (
          <Users className="size-5 text-ink-muted" aria-hidden="true" />
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        {/* `justify-between`, not a packed run: the swatches share the row's
            full width evenly, edge to edge, like the mark grid below them. */}
        {/* biome-ignore lint/a11y/useSemanticElements: a run of toggle buttons,
            which is what role="group" names; a <fieldset> would announce a form
            field set and bring its own intrinsic sizing. */}
        <div
          role="group"
          aria-label={choices.labels.colors}
          className="flex items-center justify-between border-b border-line p-3"
        >
          {choices.colors.map((swatch) => (
            <ColorSwatch
              key={swatch.id}
              label={swatch.label}
              value={swatch.value}
              selected={swatch.id === colorId}
              // Clicking the SELECTED swatch deselects it: the old "Default"
              // reset's power without a synthetic gray circle in the palette.
              onClick={() =>
                onColorChange(swatch.id === colorId ? undefined : swatch.id)
              }
            />
          ))}
        </div>
        {/* Flat by design, like the panel it heads: the borders above and
            below already frame it, and a boxed input INSIDE a popover would
            nest two field chromes. */}
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("shell:sidebar.teams.identitySearch")}
          aria-label={t("shell:sidebar.teams.identitySearch")}
          className="w-full border-b border-line bg-transparent px-3 py-2.5 text-base text-ink outline-none placeholder:text-ink-muted"
        />
        {/* The tint rides on the grid, not on each cell: one inherited ink for
            the whole preview, so an unpicked mark and a picked one are the same
            object in two states. The wash var rides with it for the cells.
            `type="scroll"` = the bar exists only WHILE scrolling. */}
        <ScrollArea
          type="scroll"
          viewportClassName="max-h-60 overscroll-contain p-3"
          style={tint ? { color: tint, ...tintVar } : undefined}
        >
          {shown.length > 0 ? (
            // biome-ignore lint/a11y/useSemanticElements: see above.
            <div
              role="group"
              aria-label={choices.labels.icons}
              className="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-2"
            >
              {shown.map((glyph) => (
                <button
                  key={glyph.name}
                  type="button"
                  aria-pressed={glyph.name === icon}
                  aria-label={glyph.label}
                  title={glyph.label}
                  onClick={() =>
                    onIconChange(glyph.name === icon ? undefined : glyph.name)
                  }
                  // A CIRCLE, hover-washed with the chosen colour: the cell
                  // answers the swatch row above it, so hovering a mark
                  // previews the tinted-icon-on-wash pair the trigger will
                  // wear. No colour picked yet = the neutral hover fill.
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full transition-colors duration-100 outline-none focus-visible:ring-2 focus-visible:ring-focus",
                    glyph.name === icon
                      ? tint
                        ? WASH_STRONG
                        : "bg-sidebar-active"
                      : tint
                        ? WASH_HOVER
                        : "hover:bg-hover",
                  )}
                >
                  <SidebarGroupGlyph
                    name={glyph.name}
                    className="size-4 text-current"
                  />
                </button>
              ))}
            </div>
          ) : (
            <p className="px-1 py-2 text-sm text-ink-muted">
              {t("shell:sidebar.teams.identitySearchEmpty")}
            </p>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
