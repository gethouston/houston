import { cn } from "@houston-ai/core";
import { storeMotion, storeType } from "@houston-ai/store";
import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { countSpecimens, filterTiers } from "./nav-filter";
import { NavGroup } from "./nav-group";
import type { SpecimenTier } from "./registry";

/**
 * The showcase's rail: a text filter over every specimen, then the two tiers —
 * `Primitives` (the inventory by kind) and `Product areas` (the same inventory
 * by where the user meets it) — with their collapsible subgroups.
 *
 * Grouped rather than flat because the rail carries the whole `@houston-ai/*`
 * inventory: a single alphabetical list of that length is a lookup, not a nav.
 */
export function ShowcaseNav({
  tiers,
  activeId,
  onSelect,
}: {
  tiers: readonly SpecimenTier[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  // Collapsed by exception: every subgroup starts open, and only the ones the
  // reader shut are remembered. A filter overrides the set entirely — a hit
  // hidden inside a collapsed group would read as no hit at all.
  const [collapsed, setCollapsed] = useState<readonly string[]>([]);

  const filtering = query.trim() !== "";
  const visible = useMemo(() => filterTiers(tiers, query), [tiers, query]);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto px-4 py-5">
      <div className="relative shrink-0">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-ink-muted"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter components"
          aria-label="Filter components"
          // Component names are not prose: the UA spell-check underlines every
          // one of them in red, and autocomplete has nothing useful to offer.
          spellCheck={false}
          autoComplete="off"
          className={cn(
            "h-9 w-full rounded-full border border-line bg-card pr-9 pl-8.5 text-[13px] text-ink outline-none placeholder:text-ink-muted",
            storeMotion,
            "hover:border-line-input focus-visible:border-focus focus-visible:ring-[3px] focus-visible:ring-focus/50",
          )}
        />
        {query ? (
          // Our own clear control: the browser's native one is a UA-coloured
          // glyph (blue in Chrome) that ignores the token palette, so
          // globals.css hides it. Always visible while there is a query —
          // never a hover-only affordance.
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Clear filter"
            className={cn(
              "absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-ink-muted outline-none",
              storeMotion,
              "hover:bg-hover hover:text-hover-text",
              "focus-visible:ring-[3px] focus-visible:ring-focus/50",
            )}
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      <nav aria-label="Specimens" className="flex flex-col gap-6">
        {visible.map((tier, index) => (
          <section
            key={tier.name}
            className={cn(
              "flex flex-col gap-3",
              index > 0 && "border-line border-t pt-6",
            )}
          >
            <h2
              className={cn(
                storeType.meta,
                "px-3 font-semibold text-[10px] text-ink uppercase tracking-[0.14em]",
              )}
            >
              {tier.name}
            </h2>
            {tier.groups.map((group) => (
              <NavGroup
                key={group.name}
                group={group}
                open={filtering || !collapsed.includes(group.name)}
                onToggle={() =>
                  setCollapsed((names) =>
                    names.includes(group.name)
                      ? names.filter((name) => name !== group.name)
                      : [...names, group.name],
                  )
                }
                lockedOpen={filtering}
                activeId={activeId}
                onSelect={onSelect}
              />
            ))}
          </section>
        ))}

        {countSpecimens(visible) === 0 ? (
          <p className={cn(storeType.meta, "px-3")}>
            Nothing matches “{query.trim()}”.
          </p>
        ) : null}
      </nav>
    </div>
  );
}
