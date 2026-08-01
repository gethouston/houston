import {
  CatalogCount,
  CatalogGrid,
  CatalogRow,
  CatalogSectionHeader,
  CatalogShowMore,
} from "@houston-ai/core";

import type { Specimen, SpecimenProp } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { availableAgents, SampleIcon } from "./sample";

const props: readonly SpecimenProp[] = [
  {
    name: "CatalogSectionHeader.title",
    type: "string",
    note: "The heading text. Localized by the consumer.",
  },
  {
    name: "CatalogSectionHeader.count",
    type: "number | string",
    note: "Trailing count chip; omit to hide it. A string renders verbatim.",
  },
  {
    name: "CatalogSectionHeader.size",
    type: '"sm" | "lg"',
    note: 'Default "sm". "lg" marks a page-level section.',
  },
  {
    name: "CatalogSectionHeader.as",
    type: '"h2" | "h3"',
    note: 'Default "h2". Use "h3" when nested under an lg header.',
  },
  {
    name: "CatalogCount.count",
    type: "number | string",
    note: "The number in the chip, or a preformatted label.",
  },
  {
    name: "CatalogGrid.children",
    type: "ReactNode",
    note: "The section's rows. One column, two from lg.",
  },
  {
    name: "CatalogShowMore.…",
    type: "ComponentPropsWithoutRef<'button'>",
    note: "A plain button: children carry the copy, onClick expands.",
  },
  {
    name: "className",
    type: "string",
    note: "Merged last on every member of the family.",
  },
];

function CatalogPrimitives() {
  return (
    <SpecimenPage
      title="Catalog"
      intro="The browse-page grammar every catalog surface shares: chevron-free section headings, count chips, the two-column grid, and the quiet expander."
    >
      <SpecimenSection
        title="Variants"
        note="Section headers carry a size and an optional count; the grid and the expander have no variants of their own."
      >
        <SpecimenRow label="Section header, lg">
          <CatalogSectionHeader title="Installed" count={2} size="lg" />
        </SpecimenRow>
        <SpecimenRow label="Section header, sm">
          <CatalogSectionHeader title="Featured" count={12} as="h3" />
        </SpecimenRow>
        <SpecimenRow label="No count">
          <CatalogSectionHeader title="Available" size="lg" />
        </SpecimenRow>
        <SpecimenRow label="Count as a label">
          <CatalogSectionHeader title="Available" count="9000+" size="lg" />
        </SpecimenRow>
        <SpecimenRow label="Count chip alone">
          <CatalogCount count={6} />
          <CatalogCount count="9000+" />
        </SpecimenRow>
        <SpecimenRow label="Grid">
          <div className="w-full">
            <CatalogGrid>
              {availableAgents.map((item) => (
                <CatalogRow
                  key={item.title}
                  icon={<SampleIcon icon={item.icon} />}
                  title={item.title}
                  description={item.description}
                />
              ))}
            </CatalogGrid>
          </div>
        </SpecimenRow>
        <SpecimenRow label="Show more">
          <CatalogShowMore>Show all 24</CatalogShowMore>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Nothing here is stateful on its own: the expander brightens on hover, and the grid simply reflows."
      >
        <SpecimenRow label="Show more, hover">
          <CatalogShowMore>Hover me: muted to full ink</CatalogShowMore>
        </SpecimenRow>
        <SpecimenRow label="Grid, one item">
          <div className="w-full">
            <CatalogGrid>
              <CatalogRow
                icon={<SampleIcon icon={availableAgents[0].icon} />}
                title={availableAgents[0].title}
                description={availableAgents[0].description}
              />
            </CatalogGrid>
          </div>
        </SpecimenRow>
        <SpecimenRow label="Counting matches">
          <CatalogSectionHeader title="Installed" count={0} size="lg" />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="Sizes"
        note="Two heading sizes, one document outline: lg for the page's own sections, sm for the sub-groups inside them."
      >
        <SpecimenRow label="lg — page section">
          <CatalogSectionHeader title="Available" count={128} size="lg" />
        </SpecimenRow>
        <SpecimenRow label="sm — sub-group">
          <CatalogSectionHeader title="Productivity" count={18} as="h3" />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={props} />

      <SpecimenTokens
        classes={[
          "bg-chip-subtle",
          "text-ink",
          "text-ink-muted",
          "hover:text-ink",
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
export const sources: string[] = [
  "CatalogCount",
  "CatalogGrid",
  "CatalogSectionHeader",
  "CatalogShowMore",
];

export const specimen: Specimen = {
  id: "core-catalog",
  title: "Catalog",
  group: "Catalog",
  render: () => <CatalogPrimitives />,
};
