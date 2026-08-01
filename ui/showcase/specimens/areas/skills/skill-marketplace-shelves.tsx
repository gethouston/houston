import { SkillMarketplaceShelves } from "@houston-ai/skills";
import type { ReactNode } from "react";
import { useState } from "react";

import type { Specimen } from "../../../src/specimen";
import {
  SpecimenPage,
  SpecimenProps,
  SpecimenRow,
  SpecimenSection,
  SpecimenTokens,
} from "../../../src/specimen";
import { installedSlugs } from "./sample";
import { mixedInstalls, noInstalls } from "./skill-marketplace-grid-parts";
import {
  dedupedShelves,
  loadingShelves,
  mixedShelves,
  shelvesLabels,
  shelvesProps,
} from "./skill-marketplace-shelves-parts";

/** The width the browse view gets inside the marketplace section. */
function Measure({ children }: { children: ReactNode }) {
  return <div className="w-full max-w-2xl">{children}</div>;
}

/** See all really selects a category upstream; the readout stands in for it. */
function LiveShelves() {
  const [seen, setSeen] = useState<string | null>(null);
  return (
    <div className="flex w-full max-w-2xl flex-col gap-2">
      <SkillMarketplaceShelves
        shelves={mixedShelves}
        allFailed={false}
        onRetry={() => undefined}
        installState={noInstalls}
        installedSkillNames={installedSlugs}
        onInstall={() => undefined}
        onOpenDetail={() => undefined}
        onSeeAll={setSeen}
        labels={shelvesLabels}
      />
      <p className="text-[13px] text-ink-muted leading-[1.4]">
        {seen
          ? `See all selected the ${seen} category.`
          : "Press See all on a shelf."}
      </p>
    </div>
  );
}

function SkillMarketplaceShelvesSpecimen() {
  return (
    <SpecimenPage
      title="Marketplace shelves"
      intro="The browse view behind an empty search box: curated category shelves, each capped at four rows, with no publisher repeated anywhere across them."
    >
      <SpecimenSection
        title="Variants"
        note="No style variants. A shelf is its header — title plus See all — over a two-column mini-grid of the same marketplace rows the search results use."
      >
        <SpecimenRow label="Shelves">
          <Measure>
            <SkillMarketplaceShelves
              shelves={mixedShelves}
              allFailed={false}
              onRetry={() => undefined}
              installState={noInstalls}
              onInstall={() => undefined}
              onOpenDetail={() => undefined}
              onSeeAll={() => undefined}
              labels={shelvesLabels}
            />
          </Measure>
        </SpecimenRow>
        <SpecimenRow label="Translated">
          <Measure>
            <SkillMarketplaceShelves
              shelves={mixedShelves}
              allFailed={false}
              onRetry={() => undefined}
              installState={noInstalls}
              onInstall={() => undefined}
              onOpenDetail={() => undefined}
              onSeeAll={() => undefined}
              labels={{
                seeAll: "Ver todo",
                browseUnavailable:
                  "No pudimos cargar las skills. Revisa tu conexión.",
                retry: "Reintentar",
                card: { bySource: (owner) => `de ${owner}` },
              }}
            />
          </Measure>
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenSection
        title="States"
        note="Each shelf settles on its own, so the view fills in progressively rather than blocking on the slowest category. An errored shelf simply isn't there — a browse view never shows a broken row."
      >
        <SpecimenRow label="All loading">
          <Measure>
            <SkillMarketplaceShelves
              shelves={loadingShelves}
              allFailed={false}
              onRetry={() => undefined}
              installState={noInstalls}
              onInstall={() => undefined}
              onOpenDetail={() => undefined}
              onSeeAll={() => undefined}
              labels={shelvesLabels}
            />
          </Measure>
        </SpecimenRow>
        <SpecimenRow label="Mixed: ready, loading, errored">
          <Measure>
            <SkillMarketplaceShelves
              shelves={mixedShelves}
              allFailed={false}
              onRetry={() => undefined}
              installState={mixedInstalls}
              installedSkillNames={installedSlugs}
              onInstall={() => undefined}
              onOpenDetail={() => undefined}
              onSeeAll={() => undefined}
              labels={shelvesLabels}
            />
          </Measure>
        </SpecimenRow>
        <SpecimenRow label="Third shelf emptied by the cross-shelf dedupe">
          <Measure>
            <SkillMarketplaceShelves
              shelves={dedupedShelves}
              allFailed={false}
              onRetry={() => undefined}
              installState={noInstalls}
              onInstall={() => undefined}
              onOpenDetail={() => undefined}
              onSeeAll={() => undefined}
              labels={shelvesLabels}
            />
          </Measure>
        </SpecimenRow>
        <SpecimenRow label="Every shelf failed">
          <Measure>
            <SkillMarketplaceShelves
              shelves={mixedShelves}
              allFailed
              onRetry={() => undefined}
              installState={noInstalls}
              onInstall={() => undefined}
              onOpenDetail={() => undefined}
              onSeeAll={() => undefined}
              labels={shelvesLabels}
            />
          </Measure>
        </SpecimenRow>
        <SpecimenRow label="Live">
          <LiveShelves />
        </SpecimenRow>
      </SpecimenSection>

      <SpecimenProps items={shelvesProps} />

      <SpecimenTokens
        classes={[
          "text-ink",
          "text-ink-muted",
          "hover:text-ink",
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
export const sources: string[] = [
  "SkillMarketplaceShelves",
  "shelfStateFromSkills",
];

export const specimen: Specimen = {
  id: "skills-marketplace-shelves",
  title: "Marketplace shelves",
  group: "Skills",
  render: () => <SkillMarketplaceShelvesSpecimen />,
};
