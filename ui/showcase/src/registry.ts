import { specimens as agentAreaSpecimens } from "../specimens/areas/agents/index";
import { specimens as boardAreaSpecimens } from "../specimens/areas/board/index";
import { specimens as chatAreaSpecimens } from "../specimens/areas/chat/index";
import { specimens as routineAreaSpecimens } from "../specimens/areas/routines/index";
import { specimens as skillAreaSpecimens } from "../specimens/areas/skills/index";
import { specimens as storeAreaSpecimens } from "../specimens/areas/store/index";
import { specimens as actionSpecimens } from "../specimens/core/actions/index";
import { specimens as catalogSpecimens } from "../specimens/core/catalog/index";
import { specimens as displaySpecimens } from "../specimens/core/display/index";
import { specimens as overlaySpecimens } from "../specimens/core/overlays/index";
import { specimens as structureSpecimens } from "../specimens/core/structure/index";
import { specimens as foundationSpecimens } from "../specimens/foundations/index";
import type { Specimen } from "./specimen";

/**
 * The rail has three tiers, and they answer three different questions.
 *
 * **Foundations** is the design system BEFORE any component: the palette, the
 * effects painted on the canvas. It sits at the top because it is what every
 * page below is an application of, and its first page is where the showcase
 * opens.
 *
 * **Primitives** is the `@houston-ai/*` inventory by kind — what a button is,
 * what an overlay is. Catalog lives here too: a catalog row is a generic list
 * primitive, not a screen of the product.
 *
 * **Product areas** is the same inventory by *where the user meets it*, named
 * and ordered exactly as the app names and orders it (`agents:tabLabels.*` and
 * `shell:sidebar.*` — the agent tab bar first, then the rail section and the
 * store view). A designer reviewing "the Routines screen" starts here.
 *
 * A specimen files itself under one group by name; `tests/registry.test.ts`
 * fails the build on a group that is not declared below, so a typo can never
 * quietly strand a page.
 */
export const SPECIMEN_TIERS = [
  {
    name: "Foundations",
    groups: ["Foundations"],
  },
  {
    name: "Primitives",
    groups: [
      "Actions & inputs",
      "Overlays",
      "Data display",
      "Structure & nav",
      "Catalog",
    ],
  },
  {
    name: "Product areas",
    groups: [
      "Activity",
      "Chat",
      "Routines",
      "Skills",
      "Your Agents",
      "Agent Store",
    ],
  },
] as const;

/** The heading a specimen files itself under, flattened across both tiers. */
export const SPECIMEN_GROUPS: readonly string[] = SPECIMEN_TIERS.flatMap(
  (tier) => tier.groups,
);

/** One subgroup heading in the rail, with the specimens filed under it. */
export interface SpecimenGroup {
  name: string;
  specimens: readonly Specimen[];
}

/** One tier heading in the rail, with its subgroups under it. */
export interface SpecimenTier {
  name: string;
  groups: readonly SpecimenGroup[];
}

/**
 * Every specimen in the showcase, assembled from the family and area index
 * modules. Adding a component is: one file in its folder, one line in that
 * folder's `index.ts`. This file changes only when a tier or group does.
 */
export const specimens: readonly Specimen[] = [
  ...foundationSpecimens,
  ...actionSpecimens,
  ...overlaySpecimens,
  ...displaySpecimens,
  ...structureSpecimens,
  ...catalogSpecimens,
  ...boardAreaSpecimens,
  ...chatAreaSpecimens,
  ...routineAreaSpecimens,
  ...skillAreaSpecimens,
  ...agentAreaSpecimens,
  ...storeAreaSpecimens,
];

/**
 * The heading every specimen was filed under that no tier declares. Rendering
 * them beats dropping them: a stranded page is far worse to debug than an
 * out-of-order heading, and the test is what actually holds group names to the
 * declared list.
 */
function undeclaredGroups(all: readonly Specimen[]): string[] {
  return [
    ...new Set(
      all
        .map((one) => one.group)
        .filter((name) => !SPECIMEN_GROUPS.includes(name)),
    ),
  ].sort();
}

/**
 * The rail: the declared tiers with their subgroups, plus a trailing tier for
 * anything mis-filed.
 *
 * A declared product area with no specimens yet is **kept** — the areas are the
 * map of the product, and an empty one tells a contributor exactly where the
 * next page goes. The nav renders it with a "No specimens yet" line rather than
 * a heading over nothing.
 */
export const specimenTiers: readonly SpecimenTier[] = (() => {
  const groupOf = (name: string): SpecimenGroup => ({
    name,
    specimens: specimens.filter((one) => one.group === name),
  });
  const declared = SPECIMEN_TIERS.map((tier) => ({
    name: tier.name as string,
    groups: tier.groups.map(groupOf),
  }));
  const stranded = undeclaredGroups(specimens);
  return stranded.length === 0
    ? declared
    : [...declared, { name: "Unfiled", groups: stranded.map(groupOf) }];
})();

/** Every non-empty subgroup, in rail order — the flat view of the same tree. */
export const specimenGroups: readonly SpecimenGroup[] = specimenTiers
  .flatMap((tier) => tier.groups)
  .filter((group) => group.specimens.length > 0);

/** Every id, in rail order — the routable set. */
export const specimenIds: readonly string[] = specimenGroups.flatMap((group) =>
  group.specimens.map((one) => one.id),
);

/**
 * How many pages document an actual component — the count in the top bar.
 *
 * Foundations pages document the design system itself (the palette, the canvas
 * effects), so counting them as components would overstate the inventory by
 * exactly the number of foundations pages.
 */
export const componentCount: number = (() => {
  const foundations: readonly string[] =
    SPECIMEN_TIERS.find((tier) => tier.name === "Foundations")?.groups ?? [];
  return specimens.filter((one) => !foundations.includes(one.group)).length;
})();

/**
 * The page the showcase opens on when the URL carries no hash.
 *
 * Named rather than "whatever sorts first": the landing page is a decision
 * (colour is the foundation everything else is judged against), and pinning it
 * means reordering a tier can never silently move the front door. Falls back
 * to the first routable id only if that page is ever deleted, so the showcase
 * can never open on the empty state.
 */
export const DEFAULT_SPECIMEN_ID: string = specimenIds.includes(
  "foundations-colors",
)
  ? "foundations-colors"
  : (specimenIds[0] ?? "");
