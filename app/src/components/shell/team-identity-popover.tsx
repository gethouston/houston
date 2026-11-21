import {
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
} from "@houston-ai/core";
import {
  matchesSidebarGroupGlyph,
  SidebarGroupGlyph,
} from "@houston-ai/layout";
import { Users } from "lucide-react";
import { type CSSProperties, useRef, useState } from "react";
import type { TeamIdentityChoices } from "./team-identity";
import {
  ColorSwatch,
  WASH,
  WASH_HOVER,
  WASH_STRONG,
  WASH_STRONG_HOVER,
} from "./team-identity-swatch";

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
  onIconChange: (name: string | undefined) => void;
  onColorChange: (id: string | undefined) => void;
}) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const tint = choices.colors.find((c) => c.id === colorId)?.value;
  const tintVar = tint
    ? ({ "--identity-tint": tint } as CSSProperties)
    : undefined;
  const shown = query.trim()
    ? choices.glyphs.filter((glyph) =>
        matchesSidebarGroupGlyph(
          glyph.name,
          query,
          glyph.label,
          glyph.concepts,
        ),
      )
    : choices.glyphs;

  return (
    <Popover
      modal
      onOpenChange={(open) => {
        if (!open) setQuery("");
        else requestAnimationFrame(() => searchRef.current?.focus());
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
      <PopoverContent align="start" className="w-[32.5rem] p-0">
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
              onClick={() =>
                onColorChange(swatch.id === colorId ? undefined : swatch.id)
              }
            />
          ))}
        </div>
        <input
          ref={searchRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={choices.labels.search}
          aria-label={choices.labels.search}
          className="w-full border-b border-line bg-transparent px-3 py-2.5 text-base text-ink outline-none placeholder:text-ink-muted"
        />
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
              {choices.labels.emptySearch}
            </p>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
