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

export const SPECIMEN_GROUPS: readonly string[] = SPECIMEN_TIERS.flatMap(
  (tier) => tier.groups,
);

export interface SpecimenGroup {
  name: string;
  specimens: readonly Specimen[];
}

export interface SpecimenTier {
  name: string;
  groups: readonly SpecimenGroup[];
}

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

function undeclaredGroups(all: readonly Specimen[]): string[] {
  return [
    ...new Set(
      all
        .map((one) => one.group)
        .filter((name) => !SPECIMEN_GROUPS.includes(name)),
    ),
  ].sort();
}

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

export const specimenGroups: readonly SpecimenGroup[] = specimenTiers
  .flatMap((tier) => tier.groups)
  .filter((group) => group.specimens.length > 0);

export const specimenIds: readonly string[] = specimenGroups.flatMap((group) =>
  group.specimens.map((one) => one.id),
);

export const componentCount: number = (() => {
  const foundations: readonly string[] =
    SPECIMEN_TIERS.find((tier) => tier.name === "Foundations")?.groups ?? [];
  return specimens.filter((one) => !foundations.includes(one.group)).length;
})();

export const DEFAULT_SPECIMEN_ID: string = specimenIds.includes(
  "foundations-colors",
)
  ? "foundations-colors"
  : (specimenIds[0] ?? "");
