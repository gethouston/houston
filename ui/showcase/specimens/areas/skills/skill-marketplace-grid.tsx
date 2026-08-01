import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { communitySkills, installedSlugs } from "./sample";
import {
  GridDemo,
  gridProps,
  mixedInstalls,
  resultsPhase,
} from "./skill-marketplace-grid-parts";

function SkillMarketplaceGridSpecimen() {
  return (
    <SpecimenPage
      title="Marketplace grid"
      intro="The skills.sh search surface: a search field and the category pill over publisher chips and a two-column grid of rows. Entirely driven by `phase` — it fetches nothing and debounces nothing."
    >
      <SpecimenSection
        title="Variants"
        note="What the grid renders is decided by two props, not by styling: `shelvesSlot` swaps the results body for the browse view, and `hideSearch` drops the field when the page owns one."
      >
        <SpecimenRow label="Search grid">
          <GridDemo phase={resultsPhase} initialQuery="contract" />
        </SpecimenRow>
        <SpecimenRow label="Search hidden (page owns the field)">
          <GridDemo phase={resultsPhase} hideSearch initialQuery="contract" />
        </SpecimenRow>
        <SpecimenRow label="Browse slot">
          <GridDemo
            phase={{ kind: "idle" }}
            shelvesSlot={
              <div className="rounded-xl border border-line border-dashed p-6 text-[13px] text-ink-muted leading-[1.4]">
                The curated shelves render here. See “Marketplace shelves”.
              </div>
            }
          />
        </SpecimenRow>
        <SpecimenRow label="Translated">
          <GridDemo
            phase={{ kind: "no-results", query: "facturas" }}
            initialQuery="facturas"
            labels={{
              searchPlaceholder: "Busca entre más de 90 mil skills...",
              publisherAllLabel: "Todos",
              allCategories: "Todas las categorías",
              noResults: (query) => `No hay skills para "${query}"`,
            }}
          />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="One row per `SkillMarketplacePhase`. The publisher chips only exist where there are results to filter, and picking one filters in place — a new search clears it at render time, never in an effect."
      >
        <SpecimenRow label="idle">
          <GridDemo phase={{ kind: "idle" }} />
        </SpecimenRow>
        <SpecimenRow label="too-short">
          <GridDemo phase={{ kind: "too-short" }} initialQuery="c" />
        </SpecimenRow>
        <SpecimenRow label="searching (first search)">
          <GridDemo
            phase={{ kind: "searching", previous: [] }}
            initialQuery="contract"
          />
        </SpecimenRow>
        <SpecimenRow label="searching (over previous results)">
          <GridDemo
            phase={{ kind: "searching", previous: communitySkills }}
            initialQuery="contracts"
          />
        </SpecimenRow>
        <SpecimenRow label="results">
          <GridDemo phase={resultsPhase} initialQuery="contract" />
        </SpecimenRow>
        <SpecimenRow label="results, mid-install">
          <GridDemo
            phase={resultsPhase}
            installState={mixedInstalls}
            installedSkillNames={installedSlugs}
            initialQuery="contract"
          />
        </SpecimenRow>
        <SpecimenRow label="no-results">
          <GridDemo
            phase={{ kind: "no-results", query: "quarterly board deck" }}
            initialQuery="quarterly board deck"
          />
        </SpecimenRow>
        <SpecimenRow label="search-error: rate_limited">
          <GridDemo
            phase={{
              kind: "search-error",
              reason: "rate_limited",
              query: "contract",
            }}
            initialQuery="contract"
          />
        </SpecimenRow>
        <SpecimenRow label="search-error: offline">
          <GridDemo
            phase={{
              kind: "search-error",
              reason: "offline",
              query: "contract",
            }}
            initialQuery="contract"
          />
        </SpecimenRow>
        <SpecimenRow label="search-error: generic">
          <GridDemo
            phase={{
              kind: "search-error",
              reason: "generic",
              query: "contract",
            }}
            initialQuery="contract"
          />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={gridProps} />

      <SpecimenTokens
        classes={[
          "border-line",
          "bg-input",
          "text-ink",
          "text-ink-muted",
          "focus:ring-focus/20",
          "bg-hover",
          "hover:bg-hover",
          "bg-chip",
          "text-ink-muted/60",
        ]}
      />
    </SpecimenPage>
  );
}

/**
 * The `@houston-ai/*` symbols this page documents. `scripts/gen-usage.mjs`
 * reads them to build the "Used in" map, so they are the exported names
 * exactly as a consumer imports them.
 */
export const sources: string[] = ["SkillMarketplaceGrid"];

export const specimen: Specimen = {
  id: "skills-marketplace-grid",
  title: "Marketplace grid",
  group: "Skills",
  render: () => <SkillMarketplaceGridSpecimen />,
};
