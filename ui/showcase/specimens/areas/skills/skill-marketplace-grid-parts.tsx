import type {
  SkillCategoryOption,
  SkillMarketplaceGridLabels,
  SkillMarketplacePhase,
} from "@houston-ai/skills";
import { DEFAULT_SHELVES, SkillMarketplaceGrid } from "@houston-ai/skills";
import type { ReactNode } from "react";
import { useState } from "react";

import type { SpecimenProp } from "../../../src/specimen";
import { communitySkills } from "./sample";

/**
 * The grid harness and its props table. The grid is presentational — every
 * screen it can show is one `phase` value — so a demo only has to own the
 * search box's text and the picked category.
 *
 * Exports no `specimen` and no `sources`: a helper module for the page beside
 * it.
 */

/** `CATEGORY_ALL` in `ui/skills/src/skill-marketplace-state-model.ts`. */
const CATEGORY_ALL = "all";

/** The curated shelves as the section hands them to the picker. */
export const categoryOptions: SkillCategoryOption[] = DEFAULT_SHELVES.map(
  (shelf) => ({ value: shelf.id, label: shelf.title }),
);

/** Nothing installing and nothing installed — the common case. */
export const noInstalls: Map<string, "installing" | "installed" | "failed"> =
  new Map();

/** One install in flight, one landed, one failed — all three at once. */
export const mixedInstalls: Map<string, "installing" | "installed" | "failed"> =
  new Map([
    ["cs-inbox-triage", "installing"],
    ["cs-meeting-notes", "installed"],
    ["cs-weekly-report", "failed"],
  ]);

/** Results for a `contract` search, in relevance order. */
export const resultsPhase: SkillMarketplacePhase = {
  kind: "results",
  skills: communitySkills,
  query: "contract",
};

export function GridDemo({
  phase,
  installState = noInstalls,
  installedSkillNames,
  shelvesSlot,
  hideSearch,
  initialQuery = "",
  labels,
}: {
  phase: SkillMarketplacePhase;
  installState?: Map<string, "installing" | "installed" | "failed">;
  installedSkillNames?: Set<string>;
  shelvesSlot?: ReactNode;
  hideSearch?: boolean;
  initialQuery?: string;
  labels?: SkillMarketplaceGridLabels;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState(CATEGORY_ALL);
  return (
    <div className="w-full max-w-2xl">
      <SkillMarketplaceGrid
        phase={phase}
        query={query}
        onQueryChange={setQuery}
        category={category}
        onCategoryChange={setCategory}
        categoryOptions={categoryOptions}
        installState={installState}
        installedSkillNames={installedSkillNames}
        onInstall={() => undefined}
        onOpenDetail={() => undefined}
        shelvesSlot={shelvesSlot}
        hideSearch={hideSearch}
        labels={labels}
      />
    </div>
  );
}

/** `SkillMarketplaceGridProps`, read off `ui/skills/src/skill-marketplace-grid.tsx`. */
export const gridProps: SpecimenProp[] = [
  {
    name: "phase",
    type: "SkillMarketplacePhase",
    note: "The whole screen: `idle`, `too-short`, `searching`, `results`, `no-results`, `search-error`. The grid fetches nothing itself.",
  },
  {
    name: "query",
    type: "string",
    note: "The search box's text, owned upstream.",
  },
  {
    name: "onQueryChange",
    type: "(q: string) => void",
    note: "Every keystroke. Debouncing belongs to the caller.",
  },
  {
    name: "category",
    type: "string",
    note: 'The picked category, or `CATEGORY_ALL` ("all").',
  },
  {
    name: "onCategoryChange",
    type: "(next: string) => void",
    note: "The category picker's selection.",
  },
  {
    name: "categoryOptions",
    type: "SkillCategoryOption[]",
    note: "Localized picker entries. Empty hides the picker.",
  },
  {
    name: "installState",
    type: 'Map<string, "installing" | "installed" | "failed">',
    note: "Per-skill install state, keyed by `CommunitySkill.id`.",
  },
  {
    name: "installedSkillNames",
    type: "Set<string>",
    note: "Lowercase slugs already on disk, so a skill installed before this session still reads as installed.",
  },
  {
    name: "onInstall",
    type: "(skill: CommunitySkill) => void",
    note: "A row's + button.",
  },
  {
    name: "onOpenDetail",
    type: "(skill: CommunitySkill) => void",
    note: "A row's body — the caller opens the preview modal.",
  },
  {
    name: "shelvesSlot",
    type: "ReactNode",
    note: "The browse view. Present, it replaces the results body and the publisher chips entirely.",
  },
  {
    name: "hideSearch",
    type: "boolean",
    note: "Drops the built-in search box when a page drives search from one shared field. The category picker stays.",
  },
  {
    name: "labels",
    type: "SkillMarketplaceGridLabels",
    note: "Placeholder, empty and error copy, and the nested row labels — already translated.",
  },
];
