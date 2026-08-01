import type { CommunitySkill, ResolvedShelf } from "@houston-ai/skills";
import { shelfStateFromSkills } from "@houston-ai/skills";

import type { SpecimenProp } from "../../../src/specimen";

/**
 * Shelf fixtures for the browse view, plus its props table. Every shelf runs
 * its skills through `shelfStateFromSkills`, the same one-per-author dedupe and
 * cap the marketplace applies, so what the page shows is what the product
 * shows. Exports no `specimen` and no `sources`.
 */

function skill(
  id: string,
  slug: string,
  source: string,
  installs: number,
): CommunitySkill {
  return { id, skillId: slug, name: slug, installs, source };
}

const marketingSkills = [
  skill("shelf-launch-email", "launch-email", "vercel/skills", 21_300),
  skill("shelf-landing-copy", "landing-copy", "anthropics/skills", 15_800),
  skill("shelf-seo-brief", "seo-brief", "julian/houston-skills", 4_120),
  skill("shelf-ad-variants", "ad-variants", "posthog/skills", 2_050),
];

const salesSkills = [
  skill("shelf-lead-research", "lead-research", "stripe/skills", 9_900),
  skill("shelf-follow-up", "follow-up-email", "supabase/skills", 6_400),
  skill("shelf-crm-hygiene", "crm-hygiene", "hubspot/skills", 1_180),
];

/** A shelf whose every author already appeared above — the dedupe empties it. */
const repeatSkills = [
  skill("shelf-repeat-brief", "campaign-brief", "vercel/skills", 3_400),
  skill("shelf-repeat-notes", "call-notes", "stripe/skills", 900),
];

/** Two ready shelves, one still loading, one errored — the usual first paint. */
export const mixedShelves: ResolvedShelf[] = [
  {
    id: "marketing",
    title: "Marketing",
    query: "marketing",
    state: shelfStateFromSkills(marketingSkills),
  },
  {
    id: "sales",
    title: "Sales",
    query: "sales",
    state: shelfStateFromSkills(salesSkills),
  },
  {
    id: "writing",
    title: "Writing",
    query: "writing",
    state: { status: "loading" },
  },
  { id: "legal", title: "Legal", query: "legal", state: { status: "error" } },
];

/** Every shelf still in flight. */
export const loadingShelves: ResolvedShelf[] = mixedShelves.map((shelf) => ({
  ...shelf,
  state: { status: "loading" },
}));

/** A ready shelf followed by one the cross-shelf dedupe empties and hides. */
export const dedupedShelves: ResolvedShelf[] = [
  {
    id: "marketing",
    title: "Marketing",
    query: "marketing",
    state: shelfStateFromSkills(marketingSkills),
  },
  {
    id: "sales",
    title: "Sales",
    query: "sales",
    state: shelfStateFromSkills(salesSkills),
  },
  {
    id: "productivity",
    title: "Productivity",
    query: "productivity",
    state: shelfStateFromSkills(repeatSkills),
  },
];

export const shelvesLabels = {
  seeAll: "See all",
  browseUnavailable: "Couldn't load skills. Check your internet and try again.",
  retry: "Try again",
};

/** `SkillMarketplaceShelvesProps`, read off `ui/skills/src/skill-marketplace-shelves.tsx`. */
export const shelvesProps: SpecimenProp[] = [
  {
    name: "shelves",
    type: "ResolvedShelf[]",
    note: "The curated categories with their fetch state. Rendered in order; a loading shelf shows skeletons, an errored or emptied one is dropped.",
  },
  {
    name: "allFailed",
    type: "boolean",
    note: "Every shelf failed — the whole view degrades to one retryable line instead of an empty screen.",
  },
  {
    name: "onRetry",
    type: "() => void",
    note: "The retry link on that fallback.",
  },
  {
    name: "installState",
    type: 'Map<string, "installing" | "installed" | "failed">',
    note: "Per-skill install state, keyed by `CommunitySkill.id`.",
  },
  {
    name: "installedSkillNames",
    type: "Set<string>",
    note: "Lowercase slugs already on disk.",
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
    name: "onSeeAll",
    type: "(shelfId: string) => void",
    note: "The shelf header's See all, which selects that category in the picker.",
  },
  {
    name: "labels",
    type: "SkillMarketplaceShelvesLabels",
    note: "`seeAll`, `browseUnavailable`, `retry`, plus the nested row labels. Required.",
  },
];
